import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getStaticSector } from "@/lib/intelligence/portfolio/sectorMap";
import { calculateSizing } from "@/lib/execution";
import { sendTelegramMessageWithButtons } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ACCOUNT_CAPITAL = Number(process.env.ACCOUNT_CAPITAL ?? 100_000);
const MAX_OPEN_POSITIONS = Number(process.env.MAX_OPEN_POSITIONS ?? 10);
const MONITOR_SECRET = process.env.RISK_MONITOR_SECRET ?? "ema100_secret_2026";

// Bekleyen fırsat havuzu — slot doluyken reddedilen sinyallerin yeniden değerlendirilmesi
const OPPORTUNITY_MIN_QUALITY_SCORE = 75;
const OPPORTUNITY_WINDOW_DAYS = 7;
const OPPORTUNITY_MAX_SIGNALS = 15;

// Stale (bayat sinyal) eşikleri — ince ayar için sabit tutuluyor
const STALE_AGE_DAYS = 3;             // bu yaşı aşan sinyale sıkı eşik + trend kontrolü uygulanır
const STALE_PRICE_MOVE_PCT = 5;       // taze sinyalde tolere edilen lehte fiyat kayması (%)
const STALE_PRICE_MOVE_PCT_AGED = 3;  // STALE_AGE_DAYS'i aşan sinyalde tolerans (%)
const STALE_RSI_BUY_MAX = 75;         // LONG adayı: güncel RSI bunu aşarsa aşırı alım → stale
const STALE_RSI_SELL_MIN = 25;        // SHORT adayı: güncel RSI bunun altındaysa aşırı satım → stale

// Canlı piyasa taraması (Matriks — doğrudan) ön-eleme eşikleri
const SCAN_RSI_OVERSOLD = 30;   // RSI bu değerin altındaysa aşırı satım adayı
const SCAN_RSI_OVERBOUGHT = 70; // RSI bu değerin üstündeyse aşırı alım adayı
const SCAN_MIN_DIST_ATR = 2;    // fiyatın EMA100'den ATR cinsinden min mutlak uzaklığı
const SCAN_MAX_SYMBOLS = 25;    // prompt'a giden maksimum sembol sayısı

// Onay gerektiren karar tipleri — bunlar artık otomatik uygulanmaz,
// PENDING olarak kaydedilip Telegram'dan onay/red butonlarıyla sorulur.
// HOLD ve HEDGE bilgi amaçlıdır, yalnızca özet raporda yer alır.
const APPROVAL_TYPES = ["CLOSE", "REDUCE", "SWAP", "RECOMMEND_OPEN"];

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ---------------------------------------------------------------------------
// GET — AI agent çalıştır
// POST — Kullanıcı ile sohbet (chat modu)
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") ??
    req.headers.get("x-monitor-secret");
  if (secret !== MONITOR_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  // reportOnly=1: yan etkisiz analiz — karar kaydı ve Telegram yok
  const reportOnly = req.nextUrl.searchParams.get("reportOnly") === "1";
  return runAgent(reportOnly);
}

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") ??
    req.headers.get("x-monitor-secret");
  if (secret !== MONITOR_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const userMessage = body.message as string;
  const chatHistory =
    ((body.conversationHistory ?? body.history) as { role: string; content: string }[]) ?? [];

  if (!userMessage) {
    return NextResponse.json({ ok: false, error: "message gerekli" }, { status: 400 });
  }

  return runChat(userMessage, chatHistory);
}

// ---------------------------------------------------------------------------
// Fırsat havuzu doğrulaması
// ---------------------------------------------------------------------------

// Sinyal anındaki yön ile güncel piyasa durumu hâlâ tutarlı mı?
// Yaş arttıkça tolerans daralır: STALE_AGE_DAYS sonrası daha sıkı fiyat
// eşiği + EMA100/MACD trend tutarlılık kontrolü devreye girer.
function validateSignalFreshness(
  sig: any,
  live: any,
  nowMs: number
): { ok: true } | { ok: false; reason: string } {
  const currentPrice = live?.last_price;
  if (!currentPrice) return { ok: false, reason: "NO_LIVE_PRICE" };

  const ageDays = (nowMs - new Date(sig.created_at).getTime()) / 86_400_000;
  const aged = ageDays > STALE_AGE_DAYS;
  const maxMovePct = aged ? STALE_PRICE_MOVE_PCT_AGED : STALE_PRICE_MOVE_PCT;
  const movePct = ((currentPrice - sig.price) / sig.price) * 100;
  const isLong = String(sig.side).toUpperCase() === "LONG";

  if (isLong) {
    // Fiyat lehte çok kaçtıysa fırsat kaçmıştır
    if (movePct > maxMovePct) return { ok: false, reason: "PRICE_RAN_AWAY" };
    // Aşırı alım bölgesine geçmişse giriş için geç
    if (live.rsi != null && live.rsi > STALE_RSI_BUY_MAX) {
      return { ok: false, reason: "RSI_OVERBOUGHT" };
    }
    // Yaşlı sinyalde trend tutarlılığı: fiyat EMA100 üstünde ve MACD negatif değil
    if (aged) {
      if (live.ema100 != null && currentPrice < live.ema100) {
        return { ok: false, reason: "AGED_BELOW_EMA100" };
      }
      if (live.macd_div != null && live.macd_div < 0) {
        return { ok: false, reason: "AGED_MACD_NEGATIVE" };
      }
    }
  } else {
    if (movePct < -maxMovePct) return { ok: false, reason: "PRICE_RAN_AWAY" };
    if (live.rsi != null && live.rsi < STALE_RSI_SELL_MIN) {
      return { ok: false, reason: "RSI_OVERSOLD" };
    }
    if (aged) {
      if (live.ema100 != null && currentPrice > live.ema100) {
        return { ok: false, reason: "AGED_ABOVE_EMA100" };
      }
      if (live.macd_div != null && live.macd_div > 0) {
        return { ok: false, reason: "AGED_MACD_POSITIVE" };
      }
    }
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Veri çekme
// ---------------------------------------------------------------------------

async function fetchPortfolioData() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [positionsRes, liveRes, goalsRes, closedRes, rejectedSignalsRes, shortEligibleRes, shortExclusionsRes, shortBanRes] = await Promise.all([
    supabase.from("positions").select("*").eq("status", "OPEN"),
    supabase.from("live_prices").select("symbol,last_price,rsi,ema20,ema50,ema100,atr,lrs,macd_div,stoc_rsi,aroon_up,aroon_down,elder_force_index"),
    supabase.from("portfolio_goals").select("*").eq("year", year).eq("month", month).single(),
    supabase.from("positions").select("pnl_amount,close_reason,closed_at").eq("status", "CLOSED").gte("closed_at", `${year}-${String(month).padStart(2, "0")}-01`),
    supabase
      .from("signals")
      .select("symbol,side,price,quality_score,strategy_tag,timeframe,created_at,rsi,macd,dist_atr")
      .eq("decision", "REJECTED_MAX_OPEN_POSITIONS_REACHED")
      .gte("quality_score", OPPORTUNITY_MIN_QUALITY_SCORE)
      .gte("created_at", new Date(Date.now() - OPPORTUNITY_WINDOW_DAYS * 86_400_000).toISOString())
      .order("quality_score", { ascending: false })
      .limit(OPPORTUNITY_MAX_SIGNALS),
    supabase.from("short_sell_eligible_symbols").select("symbol"),
    supabase.from("short_sell_temp_exclusions").select("symbol,excluded_from,excluded_until"),
    supabase.from("system_settings").select("value").eq("key", "short_sell_globally_banned").maybeSingle(),
  ]);

  const positions = positionsRes.data ?? [];
  const livePrices = liveRes.data ?? [];
  const goal = goalsRes.data;
  const closedThisMonth = closedRes.data ?? [];

  const liveMap = new Map(livePrices.map((l: any) => [l.symbol, l]));

  // Bekleyen fırsat havuzu: slot doluyken reddedilmiş yüksek kaliteli
  // sinyalleri güncel Matriks verisiyle doğrula, geçenleri zenginleştir.
  const nowMs = Date.now();
  const openSymbols = new Set(positions.map((p: any) => p.symbol));

  // Açığa satış uygunluğu: uygun liste + aktif geçici yasaklar (VBTS).
  // Sorgu hatasında set boş kalır → canShort her sembol için false
  // (güvenli varsayılan, isShortSellEligible ile aynı davranış).
  const shortEligibleSet = new Set(
    (shortEligibleRes.data ?? []).map((r: any) => String(r.symbol).toUpperCase())
  );
  const activeShortExclusions = new Set(
    (shortExclusionsRes.data ?? [])
      .filter((r: any) => {
        const from = new Date(r.excluded_from).getTime();
        const until = new Date(r.excluded_until).getTime();
        return nowMs >= from && nowMs <= until;
      })
      .map((r: any) => String(r.symbol).toUpperCase())
  );
  // Genel yasak bayrağı: true veya okunamadıysa güvenli varsayılan = yasak
  const shortGloballyBanned =
    shortBanRes.error || shortBanRes.data == null || shortBanRes.data.value === true;

  const canShort = (sym: string) =>
    !shortGloballyBanned &&
    shortEligibleSet.has(String(sym).toUpperCase()) &&
    !activeShortExclusions.has(String(sym).toUpperCase());

  const opportunityPool = (rejectedSignalsRes.data ?? []).flatMap((sig: any) => {
    if (openSymbols.has(sig.symbol)) return [];
    // SHORT adaylar açığa satışa uygun değilse agent bunları hiç görmez
    if (String(sig.side).toUpperCase() === "SHORT" && !canShort(sig.symbol)) return [];
    const live = liveMap.get(sig.symbol);
    const check = validateSignalFreshness(sig, live, nowMs);
    if (!check.ok) return [];

    const currentPrice = live.last_price;
    const movePct = ((currentPrice - sig.price) / sig.price) * 100;
    const ageMs = nowMs - new Date(sig.created_at).getTime();
    const ageDaysFloor = Math.floor(ageMs / 86_400_000);
    const ageHours = Math.floor((ageMs % 86_400_000) / 3_600_000);

    return [{
      symbol: sig.symbol,
      side: sig.side,
      sector: getStaticSector(sig.symbol) ?? "BİLİNMİYOR",
      qualityScore: sig.quality_score,
      timeframe: sig.timeframe,
      ageLabel: ageDaysFloor > 0 ? `${ageDaysFloor} gün ${ageHours} saat` : `${ageHours} saat`,
      signalPrice: sig.price,
      signalRsi: sig.rsi,
      signalMacd: sig.macd,
      currentPrice,
      priceMovePct: Math.round(movePct * 100) / 100,
      currentRsi: live.rsi,
      currentMacd: live.macd_div,
      ema100: live.ema100,
      lrs: live.lrs,
    }];
  });

  // Canlı piyasa taraması (Matriks — doğrudan): açık pozisyonlar hariç tüm
  // semboller üzerinde ön-eleme. Aşırı RSI bölgesi VEYA EMA100'den ATR
  // cinsinden belirgin sapma olan semboller uçlaşma skoruna göre sıralanır,
  // en fazla SCAN_MAX_SYMBOLS tanesi agent'a gider.
  const marketScan = livePrices
    .filter((l: any) => !openSymbols.has(l.symbol) && l.last_price > 0)
    .flatMap((l: any) => {
      const distAtr =
        l.atr && l.atr > 0 && l.ema100 != null
          ? (l.last_price - l.ema100) / l.atr
          : null;
      // Kurulumun yönü: aşırı alım / EMA100 üstüne aşırı sapma → SHORT adayı,
      // aşırı satım / EMA100 altına aşırı sapma → LONG adayı
      const longSetup =
        (l.rsi != null && l.rsi <= SCAN_RSI_OVERSOLD) ||
        (distAtr != null && distAtr <= -SCAN_MIN_DIST_ATR);
      const shortSetup =
        (l.rsi != null && l.rsi >= SCAN_RSI_OVERBOUGHT) ||
        (distAtr != null && distAtr >= SCAN_MIN_DIST_ATR);
      if (!longSetup && !shortSetup) return [];

      // Açığa satışa uygun olmayan sembol, kurulumu YALNIZCA short yönlüyse
      // listeden tamamen çıkar (agent hiç görmesin); karışık sinyalliyse
      // kalır ama shortOk=false etiketiyle yalnız LONG değerlendirilebilir
      const shortOk = canShort(l.symbol);
      if (!shortOk && shortSetup && !longSetup) return [];

      const rsiExtreme =
        l.rsi != null && (l.rsi <= SCAN_RSI_OVERSOLD || l.rsi >= SCAN_RSI_OVERBOUGHT);

      // Uçlaşma skoru: RSI'ın 50'den sapması + ATR-normalize EMA100 mesafesi
      const score =
        (rsiExtreme ? Math.abs(l.rsi - 50) : 0) +
        (distAtr != null ? Math.abs(distAtr) * 10 : 0);

      return [{
        symbol: l.symbol,
        shortOk,
        sector: getStaticSector(l.symbol) ?? "BİLİNMİYOR",
        price: l.last_price,
        rsi: l.rsi,
        ema100: l.ema100,
        distAtr: distAtr != null ? Math.round(distAtr * 10) / 10 : null,
        macdDiv: l.macd_div,
        lrs: l.lrs,
        stocRsi: l.stoc_rsi,
        aroonUp: l.aroon_up,
        aroonDown: l.aroon_down,
        score: Math.round(score * 10) / 10,
      }];
    })
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, SCAN_MAX_SYMBOLS);

  // Aylık realized PnL
  const realizedPnl = closedThisMonth.reduce((sum: number, p: any) => sum + (p.pnl_amount ?? 0), 0);

  // Unrealized PnL
  const unrealizedPnl = positions.reduce((sum: number, p: any) => {
    const live = liveMap.get(p.symbol);
    const current = live?.last_price ?? p.current_price ?? p.entry_price;
    const pnl = p.side === "LONG"
      ? (current - p.entry_price) * p.remaining_quantity
      : (p.entry_price - current) * p.remaining_quantity;
    return sum + pnl;
  }, 0);

  // Pozisyonları zenginleştir
  const enrichedPositions = positions.map((p: any) => {
    const live = liveMap.get(p.symbol);
    const current = live?.last_price ?? p.current_price ?? p.entry_price;
    const pnlPct = p.side === "LONG"
      ? ((current - p.entry_price) / p.entry_price) * 100
      : ((p.entry_price - current) / p.entry_price) * 100;
    const daysOpen = Math.floor((Date.now() - new Date(p.opened_at).getTime()) / (1000 * 60 * 60 * 24));

    return {
      symbol: p.symbol,
      side: p.side,
      sector: p.sector,
      entryPrice: p.entry_price,
      currentPrice: current,
      pnlPct: Math.round(pnlPct * 100) / 100,
      pnlAmount: Math.round((current - p.entry_price) * p.remaining_quantity * (p.side === "LONG" ? 1 : -1) * 100) / 100,
      allocatedAmount: p.allocated_amount,
      remainingQuantity: p.remaining_quantity,
      daysOpen,
      stopPrice: p.stop_price ?? p.sl_price,
      tp1Price: p.tp1_price,
      tp1Hit: p.tp1_hit,
      trailingStage: p.trailing_stage,
      rsi: live?.rsi,
      ema100: live?.ema100,
      ema20: live?.ema20,
      ema50: live?.ema50,
      atr: live?.atr,
      lrs: live?.lrs,
      macdDiv: live?.macd_div,
      stocRsi: live?.stoc_rsi,
      aroonUp: live?.aroon_up,
      aroonDown: live?.aroon_down,
      elderForce: live?.elder_force_index,
    };
  });

  // Sektör dağılımı
  const sectorMap = new Map<string, number>();
  enrichedPositions.forEach(p => {
    const s = p.sector ?? "DİĞER";
    sectorMap.set(s, (sectorMap.get(s) ?? 0) + (p.allocatedAmount ?? 0));
  });
  const totalAllocated = enrichedPositions.reduce((s, p) => s + (p.allocatedAmount ?? 0), 0);
  const sectorExposure = Array.from(sectorMap.entries()).map(([sector, amount]) => ({
    sector,
    pct: Math.round((amount / ACCOUNT_CAPITAL) * 100 * 100) / 100,
  }));

  // Hedef durumu
  const startingCapital = goal?.starting_capital ?? ACCOUNT_CAPITAL;
  const realizedTargetPct = goal?.realized_target_pct ?? 20;
  const totalTargetPct = goal?.total_target_pct ?? 30;
  const realizedTargetAmount = startingCapital * (realizedTargetPct / 100);
  const totalTargetAmount = startingCapital * (totalTargetPct / 100);

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysElapsed = now.getDate();
  const daysRemaining = daysInMonth - daysElapsed;
  const monthProgress = daysElapsed / daysInMonth;

  return {
    positions: enrichedPositions,
    opportunityPool,
    marketScan,
    sectorExposure,
    totalAllocated: Math.round(totalAllocated * 100) / 100,
    availableCapital: Math.round((ACCOUNT_CAPITAL - totalAllocated) * 100) / 100,
    availableSlots: MAX_OPEN_POSITIONS - positions.length,
    realizedPnl: Math.round(realizedPnl * 100) / 100,
    unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
    totalPnl: Math.round((realizedPnl + unrealizedPnl) * 100) / 100,
    goal: {
      realizedTarget: realizedTargetAmount,
      realizedTargetPct,
      totalTarget: totalTargetAmount,
      totalTargetPct,
      maxDrawdownPct: goal?.max_drawdown_pct ?? 5,
      dailyMaxDrawdownPct: goal?.daily_max_drawdown_pct ?? 1,
      maxSectorExposurePct: goal?.max_sector_exposure_pct ?? 25,
    },
    monthInfo: {
      year,
      month,
      daysElapsed,
      daysRemaining,
      monthProgress: Math.round(monthProgress * 100),
    },
    closedThisMonth: closedThisMonth.length,
    accountCapital: ACCOUNT_CAPITAL,
    maxPositions: MAX_OPEN_POSITIONS,
  };
}

// ---------------------------------------------------------------------------
// Sistem promptu
// ---------------------------------------------------------------------------

function buildSystemPrompt(data: any, mode: "agent" | "chat" = "agent"): string {
  return `Sen TIOS'un (Trading Intelligence & Operations System) yapay zeka destekli portföy yöneticisisin.

GÖREV:
Kullanıcının BIST portföyünü profesyonel bir fon yöneticisi gibi yönetmek.
Kararlarını Supabase'e yaz, Telegram'a bildir.
Kullanıcı sadece aylık hedefi belirler ve sonuçları izler.

PORTFÖY DURUMU (${new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}):

AÇIK POZİSYONLAR (${data.positions.length}/${data.maxPositions}):
${data.positions.map((p: any) => `
  ${p.symbol} | ${p.side} | Giriş: ${p.entryPrice} | Güncel: ${p.currentPrice} | PnL: %${p.pnlPct} (${p.pnlAmount} TL)
  Gün: ${p.daysOpen} | Stop: ${p.stopPrice} | TP1: ${p.tp1Price} | Stage: ${p.trailingStage}
  RSI: ${p.rsi?.toFixed(1) ?? "?"} | EMA100: ${p.ema100?.toFixed(2) ?? "?"} | MACD: ${p.macdDiv?.toFixed(4) ?? "?"} | Aroon↑: ${p.aroonUp?.toFixed(0) ?? "?"} | Aroon↓: ${p.aroonDown?.toFixed(0) ?? "?"}
  LRS: ${p.lrs?.toFixed(3) ?? "?"} | ATR: ${p.atr?.toFixed(3) ?? "?"} | StocRSI: ${p.stocRsi?.toFixed(1) ?? "?"} | Elder Force: ${p.elderForce?.toFixed(0) ?? "?"}
`).join("")}

SEKTÖR DAĞILIMI:
${data.sectorExposure.map((s: any) => `  ${s.sector}: %${s.pct}`).join("\n")}

BEKLEYEN FIRSAT HAVUZU (TradingView — Matriks ile doğrulanmış):
${data.opportunityPool.length === 0
  ? "  (Boş — doğrulamayı geçen bekleyen sinyal yok.)"
  : data.opportunityPool.map((o: any) => `
  ${o.symbol} | ${o.side} | Sektör: ${o.sector} | Kalite: ${o.qualityScore} | TF: ${o.timeframe ?? "-"} | Yaş: ${o.ageLabel}
  Sinyal anı: Fiyat ${o.signalPrice} | RSI ${o.signalRsi?.toFixed(1) ?? "?"} | MACD ${o.signalMacd?.toFixed(4) ?? "?"}
  Güncel: Fiyat ${o.currentPrice} (${o.priceMovePct >= 0 ? "+" : ""}%${o.priceMovePct}) | RSI ${o.currentRsi?.toFixed(1) ?? "?"} | MACD ${o.currentMacd?.toFixed(4) ?? "?"} | EMA100 ${o.ema100?.toFixed(2) ?? "?"} | LRS ${o.lrs?.toFixed(3) ?? "?"}
`).join("")}

CANLI PİYASA TARAMASI (Matriks — doğrudan, ön onaysız):
${data.marketScan.length === 0
  ? "  (Boş — tarama kriterlerine uyan sembol yok.)"
  : data.marketScan.map((m: any) => `
  ${m.symbol} | Sektör: ${m.sector} | Short: ${m.shortOk ? "uygun" : "YASAK"} | Fiyat ${m.price} | RSI ${m.rsi?.toFixed(1) ?? "?"} | EMA100 ${m.ema100?.toFixed(2) ?? "?"} | distATR ${m.distAtr != null ? (m.distAtr >= 0 ? "+" : "") + m.distAtr : "?"} | MACD ${m.macdDiv?.toFixed(4) ?? "?"} | LRS ${m.lrs?.toFixed(3) ?? "?"} | StocRSI ${m.stocRsi?.toFixed(1) ?? "?"} | Aroon ↑${m.aroonUp?.toFixed(0) ?? "?"}/↓${m.aroonDown?.toFixed(0) ?? "?"}
`).join("")}

SERMAYE:
  Toplam: ${data.accountCapital.toLocaleString("tr-TR")} TL
  Kullanılan: ${data.totalAllocated.toLocaleString("tr-TR")} TL
  Boş: ${data.availableCapital.toLocaleString("tr-TR")} TL
  Boş Slot: ${data.availableSlots}

AYLIK PERFORMANS (${data.monthInfo.daysElapsed}. gün, ${data.monthInfo.daysRemaining} gün kaldı):
  Realized PnL: ${data.realizedPnl.toLocaleString("tr-TR")} TL / Hedef: ${data.goal.realizedTarget.toLocaleString("tr-TR")} TL (%${data.goal.realizedTargetPct})
  Toplam PnL: ${data.totalPnl.toLocaleString("tr-TR")} TL / Hedef: ${data.goal.totalTarget.toLocaleString("tr-TR")} TL (%${data.goal.totalTargetPct})
  Bu ay kapanan: ${data.closedThisMonth} işlem
  Ay ilerlemesi: %${data.monthInfo.monthProgress}

HEDEF VE LİMİTLER:
  Aylık realized hedef: %${data.goal.realizedTargetPct}
  Aylık toplam hedef: %${data.goal.totalTargetPct}
  Max drawdown: %${data.goal.maxDrawdownPct}
  Günlük max drawdown: %${data.goal.dailyMaxDrawdownPct}
  Max sektör exposure: %${data.goal.maxSectorExposurePct}

KARAR YETKİLERİN:
- Pozisyon KAPAT (stop veya hedef dışı, momentum düşüşü)
- Pozisyon AZALT (kısmi satış)
- Yeni pozisyon ÖNERİ (sadece öneri, bağlantı açma yok)
- HOLD (bekle, izle)
- Hedging önerisi (SHORT pozisyon önerisi)

FIRSAT KAYNAĞI KURALLARI:
- RECOMMEND_OPEN veya SWAP kararı verirken İKİ kaynaktan aday kullanabilirsin:
  1) "BEKLEYEN FIRSAT HAVUZU" (TradingView) → kararda source: "TRADINGVIEW_POOL"
  2) "CANLI PİYASA TARAMASI" (Matriks) → kararda source: "MATRIKS_SCREENING"
- Her RECOMMEND_OPEN/SWAP kararında "side" ve "source" alanlarını mutlaka doldur.
- İki kaynak da boşsa veya uygun aday yoksa hiç RECOMMEND_OPEN/SWAP üretme.
  Bu iki listede olmayan sembol önerme, sembol İCAT ETME.
- DİKKAT: Matriks taraması TradingView'ın çok katmanlı onay sürecinden
  GEÇMEMİŞTİR. Bu adaylarda tek göstergeye dayanma — en az 2-3 göstergenin
  (RSI, MACD, LRS, Aroon, distATR) aynı yönü teyit etmesini şart koş ve
  gerekçende daha temkinli bir dil kullan.
- AÇIĞA SATIŞ KURALI: SHORT önerisi yalnızca açığa satışa uygun sembollerde
  verilebilir. Taramada "Short: YASAK" işaretli sembollere ASLA SHORT önerme
  (bu semboller yalnızca LONG değerlendirilebilir). Havuzdaki SHORT adaylar
  zaten uygunluk filtresinden geçmiştir.
- Sinyalin yaşını dikkate al (TradingView havuzu): ${STALE_AGE_DAYS} günden eski
  sinyallere temkinli yaklaş, önerinin gerekçesinde sinyal yaşını ve güncel
  veriyle tutarlılığını belirt.

${mode === "agent" ? `ÇIKTI KURALLARI:
Yanıtın SADECE geçerli JSON olmalı. Kod bloğu (\`\`\`) kullanma.
JSON dışında hiçbir metin, açıklama veya giriş cümlesi ekleme.
Yanıtın ilk karakteri { ve son karakteri } olmalı.

KARAR FORMATI:
Her kararını şu JSON formatında ver:
{
  "decisions": [
    {
      "type": "CLOSE|REDUCE|SWAP|RECOMMEND_OPEN|HOLD|HEDGE",
      "symbol": "SEMBOL",
      "reason": "kısa sebep",
      "details": "detaylı açıklama",
      "urgency": "HIGH|MEDIUM|LOW",
      "side": "LONG|SHORT (sadece RECOMMEND_OPEN/SWAP için zorunlu)",
      "source": "TRADINGVIEW_POOL|MATRIKS_SCREENING (sadece RECOMMEND_OPEN/SWAP için zorunlu)"
    }
  ],
  "summary": "genel portföy değerlendirmesi",
  "monthlyOutlook": "aylık hedefe ulaşma tahmini"
}` : `SOHBET MODU:
Kullanıcı ile serbest sohbet ediyorsun. Yanıtını DÜZ TÜRKÇE METİN olarak ver.
JSON, kod bloğu veya karar formatı KULLANMA.
CLOSE/REDUCE/RECOMMEND_OPEN gibi karar ÜRETME — soruları yukarıdaki portföy
verisine dayanarak bilgilendirici şekilde cevapla. Kısa ve net ol; kullanıcı
detay isterse derinleş.`}

TÜRKÇE konuş. Profesyonel ama anlaşılır ol. Gereksiz teknik jargondan kaçın.
Sadece gerçek veriye dayan, tahmin üretme.`;
}

// ---------------------------------------------------------------------------
// Agent modu — günlük analiz
// ---------------------------------------------------------------------------

async function runAgent(reportOnly = false) {
  try {
    const data = await fetchPortfolioData();
    const systemPrompt = buildSystemPrompt(data);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: "Portföyü analiz et ve gerekli kararları ver. JSON formatında yanıt ver."
      }]
    });

    if (response.stop_reason === "max_tokens") {
      console.warn("AI_AGENT_TRUNCATED: yanıt max_tokens sınırında kesildi, JSON parse başarısız olabilir");
    }

    const rawText = response.content[0].type === "text" ? response.content[0].text : "";

    // JSON parse
    let parsed: any = null;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("AI_AGENT_PARSE_ERROR", rawText.slice(0, 200));
      parsed = {
        decisions: [],
        summary: "Rapor oluşturulamadı — model çıktısı işlenemedi, bir sonraki çalışmada tekrar denenecek.",
        monthlyOutlook: "",
      };
    }

    const decisions = parsed?.decisions ?? [];

    let pendingRows: any[] = [];

    // reportOnly modunda hiçbir yan etki üretilmez: ai_decisions kaydı yok,
    // Telegram bildirimi yok — sadece analiz sonucu döner (rapor kartı için).
    if (!reportOnly) {

    // Onay gerektiren kararlar PENDING olarak kaydedilir — pozisyonlara
    // dokunulmaz. Uygulama, telegram-webhook (onay) veya
    // telegram-reminder-check (süre dolunca) üzerinden yapılır.
    const actionable = decisions.filter((d: any) => APPROVAL_TYPES.includes(d.type));

    if (actionable.length > 0) {
      const rows = actionable.map((d: any) => {
        const pos = data.positions.find((p: any) => p.symbol === d.symbol);
        const pool = data.opportunityPool.find((o: any) => o.symbol === d.symbol);
        const scan = data.marketScan.find((m: any) => m.symbol === d.symbol);

        let suggestedSide: string | null = null;
        let suggestedPrice: number | null = null;
        let suggestedQty: number | null = null;

        if (pos && d.type !== "RECOMMEND_OPEN") {
          suggestedSide = pos.side;
          suggestedPrice = pos.currentPrice;
          suggestedQty = pos.remainingQuantity;
        } else {
          // Yeni pozisyon adayı: yön agent kararından, yoksa TradingView
          // havuzundan; fiyat havuz > tarama sırasıyla güncel veriden
          suggestedSide = d.side ?? pool?.side ?? null;
          suggestedPrice = pool?.currentPrice ?? scan?.price ?? null;
          if (suggestedPrice) {
            try {
              suggestedQty = calculateSizing(suggestedPrice).quantity;
            } catch {
              suggestedQty = null;
            }
          }
        }

        return {
          decision_type: d.type,
          symbol: d.symbol,
          reason: d.reason,
          details: { detail: d.details, urgency: d.urgency, source: d.source ?? null },
          portfolio_context: {
            realizedPnl: data.realizedPnl,
            totalPnl: data.totalPnl,
            monthProgress: data.monthInfo.monthProgress,
          },
          executed: false,
          status: "PENDING",
          suggested_side: suggestedSide,
          suggested_price: suggestedPrice,
          suggested_qty: suggestedQty,
        };
      });

      const { data: inserted, error: insertErr } = await supabase
        .from("ai_decisions")
        .insert(rows)
        .select("id,decision_type,symbol,reason,details,suggested_side,suggested_price,suggested_qty");

      if (insertErr) console.error("AI_DECISIONS_INSERT_ERROR", insertErr.message);
      pendingRows = inserted ?? [];
    }

    // Özet raporu (butonsuz)
    await sendTelegramAgentReport(decisions, parsed?.summary, parsed?.monthlyOutlook, data);

    // Her PENDING karar için onay butonlu ayrı mesaj
    for (const dec of pendingRows) {
      const lines = [
        "🔔 ONAY BEKLEYEN KARAR",
        `${decisionEmoji(dec.decision_type)} ${dec.decision_type}: ${dec.symbol}`,
        `Sebep: ${dec.reason ?? "-"}`,
      ];
      if (dec.suggested_side) {
        lines.push(`Öneri: ${dec.suggested_side} ${dec.suggested_qty ?? "?"} lot @ ${dec.suggested_price ?? "?"}`);
      }
      if (dec.details?.source) {
        lines.push(`Kaynak: ${dec.details.source === "MATRIKS_SCREENING" ? "Matriks taraması (ön onaysız — temkinli)" : "TradingView havuzu (doğrulanmış)"}`);
      }
      lines.push("");
      lines.push("⏱ 5 dk içinde yanıt yoksa hatırlatılır, 10 dk sonra hâlâ geçerliyse otomatik uygulanır.");

      const sent = await sendTelegramMessageWithButtons(lines.join("\n"), [[
        { text: "✅ Onayla", callback_data: `approve:${dec.id}` },
        { text: "❌ Reddet", callback_data: `reject:${dec.id}` },
      ]]);

      if (sent.messageId) {
        await supabase
          .from("ai_decisions")
          .update({
            telegram_message_id: sent.messageId,
            telegram_chat_id: sent.chatId,
          })
          .eq("id", dec.id);
      }
    }

    } // if (!reportOnly)

    return NextResponse.json({
      ok: true,
      reportOnly,
      generatedAt: new Date().toISOString(),
      pendingApprovals: pendingRows.length,
      decisions,
      summary: parsed?.summary,
      monthlyOutlook: parsed?.monthlyOutlook,
      portfolioSnapshot: {
        openPositions: data.positions.length,
        realizedPnl: data.realizedPnl,
        totalPnl: data.totalPnl,
        monthProgress: data.monthInfo.monthProgress,
      }
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("AI_AGENT_ERROR", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Chat modu — kullanıcı ile sohbet
// ---------------------------------------------------------------------------

async function runChat(userMessage: string, chatHistory: { role: string; content: string }[]) {
  try {
    const data = await fetchPortfolioData();
    const systemPrompt = buildSystemPrompt(data, "chat");

    const messages = [
      ...chatHistory.map(h => ({ role: h.role as "user" | "assistant", content: h.content })),
      { role: "user" as const, content: userMessage }
    ];

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: systemPrompt,
      messages,
    });

    const reply = response.content[0].type === "text" ? response.content[0].text : "";

    return NextResponse.json({
      ok: true,
      reply,
      updatedHistory: [
        ...chatHistory,
        { role: "user", content: userMessage },
        { role: "assistant", content: reply },
      ]
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------

function truncateAtSentence(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastDot = cut.lastIndexOf(".");
  if (lastDot > 0) return cut.slice(0, lastDot + 1);
  return cut + "...";
}

function decisionEmoji(type: string): string {
  return type === "CLOSE" ? "🔴"
    : type === "REDUCE" ? "🟡"
    : type === "RECOMMEND_OPEN" ? "🟢"
    : type === "HEDGE" ? "🔵"
    : type === "SWAP" ? "🔄"
    : "⚪";
}

function sanitizeSummary(text: string): string {
  return text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

async function sendTelegramAgentReport(decisions: any[], summary: string, outlook: string, data: any) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  const lines: string[] = [];
  lines.push("🤖 AI PORTFÖY YÖNETİCİSİ");
  lines.push(`📅 ${new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}`);
  lines.push("");

  // Performans özeti
  lines.push(`📊 Ay ${data.monthInfo.daysElapsed}. gün (%${data.monthInfo.monthProgress})`);
  lines.push(`Realized: ${data.realizedPnl.toLocaleString("tr-TR")} ₺ / Hedef: ${data.goal.realizedTarget.toLocaleString("tr-TR")} ₺`);
  lines.push(`Toplam: ${data.totalPnl.toLocaleString("tr-TR")} ₺`);
  lines.push("");

  if (decisions.length === 0) {
    lines.push("✅ Aksiyon gerektiren durum yok.");
  } else {
    for (const d of decisions) {
      lines.push(`${decisionEmoji(d.type)} ${d.type}: ${d.symbol}`);
      lines.push(`   ${d.reason}`);
      if (d.urgency === "HIGH") lines.push(`   ⚠️ ACİL`);
      if (APPROVAL_TYPES.includes(d.type)) lines.push(`   ⏳ Onay bekliyor — ayrı mesajdaki butonları kullan`);
      lines.push("");
    }
  }

  if (summary) {
    lines.push("📝 GENEL DEĞERLENDİRME");
    lines.push(truncateAtSentence(sanitizeSummary(summary), 600));
    lines.push("");
  }

  if (outlook) {
    lines.push("🎯 AYLIK HEDEF TAHMİNİ");
    lines.push(truncateAtSentence(outlook, 500));
  }

  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: lines.join("\n"),
      disable_web_page_preview: true,
    }),
  });
}
