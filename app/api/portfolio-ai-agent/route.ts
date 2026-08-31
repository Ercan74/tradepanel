import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getStaticSector } from "@/lib/intelligence/portfolio/sectorMap";
import { getPositionContext } from "@/lib/intelligence/position";
import { calculateSizing } from "@/lib/execution";
import { sendTelegramMessageWithButtons } from "@/lib/telegram";
import { getDataFreshness, formatTradeTimeTR, DATA_FRESHNESS_THRESHOLD_MINUTES, ENTRY_FRESHNESS_THRESHOLD_MINUTES, ENTRY_FRESHNESS_MIN_STALE_COUNT } from "@/lib/marketStatus";
import { applyCooldownFilter } from "@/lib/cooldown";
import { marketRegimeFromIndex, maxDayChangePct, isDayChangeExtended, type MarketRegime } from "@/lib/entryGuard";
import { valuationSnapshot } from "@/lib/valuationSnapshot";
import { FINANCIAL_SECTORS, type FundRow, type MarketMultiples, type PeerContext } from "@/lib/valuation";
import { detectTavanSeries, tavanSeriesSummary } from "@/lib/tavanSeries";
import { checkSingleStockCatalyst } from "@/lib/singleStockCatalyst";
import { isViop } from "@/lib/viop";

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

// SWAP (rotasyon) eşiği: bir havuz adayı, en zayıf açık pozisyonun "tutma sağlığı"
// skorunu EN AZ bu kadar puan geçmedikçe deterministik SWAP adayı olarak sunulmaz.
// Konservatif başlangıç (+40); env ile tek satırda ayarlanır. Aday quality_score ve
// pozisyon healthScore aynı 0-100 ölçeğinde olduğu için doğrudan çıkarılır.
const SWAP_MIN_QUALITY_GAP = Number(process.env.SWAP_MIN_QUALITY_GAP ?? 40);

// Haber/temel bağlam entegrasyonu KILL-SWITCH. false → agent haberi HİÇ görmez
// (teknik-only'ye döner). Over-weighting / davranış bozulursa tek env ile kapat.
const NEWS_CONTEXT_ENABLED = (process.env.NEWS_CONTEXT_ENABLED ?? "true") !== "false";

// Stale (bayat sinyal) eşikleri — ince ayar için sabit tutuluyor
const STALE_AGE_DAYS = 3;             // bu yaşı aşan sinyale sıkı eşik + trend kontrolü uygulanır
const STALE_PRICE_MOVE_PCT = 5;       // taze sinyalde tolere edilen lehte fiyat kayması (%)
const STALE_PRICE_MOVE_PCT_AGED = 3;  // STALE_AGE_DAYS'i aşan sinyalde tolerans (%)
const STALE_RSI_BUY_MAX = 75;         // LONG adayı: güncel RSI bunu aşarsa aşırı alım → stale
const STALE_RSI_SELL_MIN = 25;        // SHORT adayı: güncel RSI bunun altındaysa aşırı satım → stale

// Canlı piyasa taraması (Matriks — doğrudan) ön-eleme eşikleri
const SCAN_RSI_OVERSOLD = 30;   // RSI bu değerin altındaysa aşırı satım adayı
const SCAN_RSI_OVERBOUGHT = 70; // RSI bu değerin üstündeyse aşırı alım adayı
const SCAN_MIN_DIST_ATR = 2.5;  // mean-reversion: EMA100'den min mutlak uzaklık (ATR) — momentum bandıyla çakışmasın diye 2.5
const SCAN_MAX_SYMBOLS = 25;    // prompt'a giden maksimum sembol sayısı

// Momentum-devam (trend takip) kurulum eşikleri — mean-reversion'ın YANINA
// eklenen ikinci aday tipi: "güçlü ama aşırı olmayan, sağlıklı trend".
// LONG: RSI 55-70 + LRS>0 + Aroon↑≥70 + distATR +0.5..+2.5
// SHORT: RSI 30-45 + LRS<0 + Aroon↓≥70 + distATR -2.5..-0.5 (simetrik)
// Not: momentum tavanı (2.5) = mean-reversion tabanı (SCAN_MIN_DIST_ATR) —
// 2.0-2.5 bandındaki "güçlü ama henüz aşırı olmayan" trendler momentum'a düşer.
const MOMO_RSI_LONG_MIN = 55;
const MOMO_RSI_LONG_MAX = 70;
const MOMO_RSI_SHORT_MIN = 30;
const MOMO_RSI_SHORT_MAX = 45;
const MOMO_AROON_MIN = 70;      // baskın Aroon kolu en az bu değerde olmalı
const MOMO_DIST_ATR_MIN = 0.5;  // trend yönünde EMA100'den min sapma (ATR birimi)
const MOMO_DIST_ATR_MAX = 2.5;  // aşırılık sınırı (mean-reversion bölgesine girmeden)

// Onay gerektiren karar tipleri — bunlar artık otomatik uygulanmaz,
// PENDING olarak kaydedilip Telegram'dan onay/red butonlarıyla sorulur.
// HOLD ve HEDGE bilgi amaçlıdır, yalnızca özet raporda yer alır.
// REDUCE EMEKLİ (2026-08-19): kısmi kâr-alma tamamen mekanik modele (risk-monitor
// TP1 %25 + trailing) bırakıldı; agent'ın iradi azaltma yetkisi kaldırıldı. REDUCE
// bu listede olmadığı için model üretse bile pending'e dönüşmez, uygulanmaz.
const APPROVAL_TYPES = ["CLOSE", "SWAP", "RECOMMEND_OPEN"];

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
  // debugPrompt=1: TAMAMEN yan etkisiz önizleme — Anthropic çağrısı YOK,
  // yazma YOK. Gerçek portföyden kurulan promptu + türetilmiş sağlık/SWAP
  // verisini döndürür. Yeni SWAP rotasyon mantığını canlı veriyle görmek için.
  if (req.nextUrl.searchParams.get("debugPrompt") === "1") {
    const data = await fetchPortfolioData();
    return NextResponse.json({
      ok: true,
      debugPrompt: true,
      weakestPositionSymbol: data.weakestPositionSymbol,
      availableSlots: data.availableSlots,
      swapCandidates: data.swapCandidates,
      positionsHealth: data.positions.map((p: any) => ({
        symbol: p.symbol,
        side: p.side,
        pnlPct: p.pnlPct,
        healthScore: p.healthScore,
        reversalProbability: p.reversalProbability,
        suggestedAction: p.suggestedAction,
      })),
      opportunityPool: data.opportunityPool.map((o: any) => ({ symbol: o.symbol, side: o.side, qualityScore: o.qualityScore })),
      prompt: buildSystemPrompt(data, "agent"),
    });
  }
  // reportOnly=1: yan etkisiz analiz — karar kaydı ve Telegram yok
  const reportOnly = req.nextUrl.searchParams.get("reportOnly") === "1";
  // trigger: çağıran taraf kendini tanıtır (agent_run_log.trigger_source)
  const trigger =
    req.nextUrl.searchParams.get("trigger") ??
    (reportOnly ? "manual_report" : "manual_agent");
  return runAgent(reportOnly, trigger);
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

// Pozisyon "tutma sağlığı" (0-100): pozisyon-zekâsı motorunun momentum + trend
// gücü + (100 - dönüş ihtimali) harmanı, stop yakınlığı cezasıyla. Adayların
// quality_score'uyla AYNI 0-100 ölçeğine normalize edilir ki SWAP karşılaştırması
// (aday kalitesi vs en zayıf pozisyon sağlığı) elmayla-elma olsun. Düşük skor =
// tutmaya değmeyen pozisyon (rotasyon adayı). Yüksek skor = sağlıklı, koru.
function computePositionHealth(p: {
  symbol: string;
  side: "LONG" | "SHORT" | "-";
  entryPrice: number;
  currentPrice: number;
  stopPrice: number | null;
  tp1Price: number | null;
  pnlPct: number;
  pnlAmount: number;
  daysOpen: number;
  allocatedAmount: number | null;
  remainingQuantity: number | null;
  entryScore: number | null;
}): { healthScore: number; reversalProbability: number; suggestedAction: string } {
  const slDistancePct =
    p.stopPrice && p.stopPrice > 0 && p.currentPrice > 0
      ? p.side === "SHORT"
        ? ((p.stopPrice - p.currentPrice) / p.currentPrice) * 100
        : ((p.currentPrice - p.stopPrice) / p.currentPrice) * 100
      : null;

  const ctx = getPositionContext({
    id: p.symbol,
    symbol: p.symbol,
    side: p.side,
    entry: p.entryPrice,
    current: p.currentPrice,
    stop: p.stopPrice ?? 0,
    tp1: p.tp1Price ?? 0,
    pnlPct: p.pnlPct,
    pnl: p.pnlAmount,
    slDistancePct,
    age: `${p.daysOpen}g`,
    score: p.entryScore ?? 0,
    allocated: p.allocatedAmount ?? 0,
    qty: p.remainingQuantity ?? 0,
  });

  const m = ctx.value;
  const stopPenalty =
    m.stopProximityRisk === "CRITICAL" ? 25 :
    m.stopProximityRisk === "HIGH" ? 12 :
    m.stopProximityRisk === "MODERATE" ? 5 : 0;

  const raw =
    0.40 * m.momentumScore +
    0.35 * m.trendStrengthScore +
    0.25 * (100 - m.reversalProbability) -
    stopPenalty;

  return {
    healthScore: Math.round(Math.max(0, Math.min(100, raw))),
    reversalProbability: m.reversalProbability,
    suggestedAction: m.suggestedAction,
  };
}

async function fetchPortfolioData() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [positionsRes, liveRes, goalsRes, closedRes, rejectedSignalsRes, shortEligibleRes, shortExclusionsRes, shortBanRes, xu100ChangeRes, cumulativeClosedRes, fundamentalsRes, historicalPeRes] = await Promise.all([
    supabase.from("positions").select("*").eq("status", "OPEN"),
    supabase.from("live_prices").select("symbol,last_price,change_pct,prev_day_change_pct,rsi,ema20,ema50,ema100,atr,lrs,macd_div,stoc_rsi,aroon_up,aroon_down,elder_force_index,matriks_trade_time,adx,stoch_fast_k,stoch_fast_d,rsi_4h,ema100_4h,ema20_4h,ema50_4h,atr_4h,adx_4h,stoch_fast_k_4h,stoch_fast_d_4h,pb,pe,ev_ebitda,mkt_cap,firm_value,sector"),
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
    // Günlük değişim % yalnızca global_context_prices'ta; endeks indikatörleri
    // (RSI/EMA/LRS) live_prices'ta (2026-07-16 Excel+script güncellemesi sonrası)
    supabase.from("global_context_prices").select("symbol,change_pct").eq("symbol", "XU100").maybeSingle(),
    // Kümülatif (tüm-zaman) realized PnL için — sadece PF raporunda ön bilgi olarak gösterilir.
    supabase.from("positions").select("pnl_amount").eq("status", "CLOSED"),
    // DEĞERLEME BAĞLAMI (Aşama-1 gözlem): temel veriler + öz-tarihsel F/K.
    supabase.from("fundamentals").select("*"),
    supabase.from("historical_pe").select("symbol,pe_6m,pe_1y,pe_2y"),
  ]);

  const positions = positionsRes.data ?? [];
  const livePrices = liveRes.data ?? [];
  const goal = goalsRes.data;
  const closedThisMonth = closedRes.data ?? [];
  const closedAllTime = cumulativeClosedRes.data ?? [];

  const liveMap = new Map(livePrices.map((l: any) => [l.symbol, l]));

  const nowMs = Date.now();

  // ---- PİYASA BAĞLAMI (XU100) ----
  // İndikatörler live_prices'tan, günlük değişim global_context_prices'tan.
  // Degrade kuralı: XU100 satırı/fiyatı yoksa VEYA matriks_trade_time bayatsa
  // → available:false ("veri yok"; seans öncesi D=0 + eski damga bu dala düşer).
  // Taze + değişim 0 ise gerçek yatay kabul edilir (available:true, %0.0).
  const xu100 = liveMap.get("XU100") as any;
  // AŞIRI-UZAMA giriş eşiği piyasa rejimine göre (XU100 EMA dizilimi + ADX):
  // yatay/sıkışık %5, güçlü trend %7 (kullanıcı kalibrasyonu). Deterministik —
  // model çıktısından bağımsız, havuz filtresinde ve prompt notunda kullanılır.
  const entryRegime: MarketRegime = marketRegimeFromIndex(xu100);
  const entryDayChangeThreshold = maxDayChangePct(entryRegime);
  const xu100AgeMin = xu100?.matriks_trade_time
    ? (nowMs - new Date(xu100.matriks_trade_time).getTime()) / 60_000
    : null;
  const xu100Stale =
    xu100AgeMin == null || !Number.isFinite(xu100AgeMin) || xu100AgeMin > DATA_FRESHNESS_THRESHOLD_MINUTES;
  const xu100Price = Number(xu100?.last_price);
  const marketContext =
    xu100 && Number.isFinite(xu100Price) && xu100Price > 0 && !xu100Stale
      ? {
          available: true,
          price: xu100Price,
          changePct: Number(xu100ChangeRes.data?.change_pct ?? 0),
          rsi: xu100.rsi ?? null,
          ema20: xu100.ema20 ?? null,
          ema50: xu100.ema50 ?? null,
          ema100: xu100.ema100 ?? null,
          lrs: xu100.lrs ?? null,
          atr: xu100.atr ?? null,
          ageMinutes: Math.round(xu100AgeMin as number),
          // Faz-2 için taşınıyor (BREAKOUT_SETUP / 4H rejim) — prompt kullanmıyor.
          adx: xu100.adx ?? null,
          stochFastK: xu100.stoch_fast_k ?? null,
          stochFastD: xu100.stoch_fast_d ?? null,
          rsi4h: xu100.rsi_4h ?? null,
          ema1004h: xu100.ema100_4h ?? null,
          ema204h: xu100.ema20_4h ?? null,
          ema504h: xu100.ema50_4h ?? null,
          atr4h: xu100.atr_4h ?? null,
          adx4h: xu100.adx_4h ?? null,
          stochFastK4h: xu100.stoch_fast_k_4h ?? null,
          stochFastD4h: xu100.stoch_fast_d_4h ?? null,
        }
      : { available: false as const };

  // Bekleyen fırsat havuzu: slot doluyken reddedilmiş yüksek kaliteli
  // sinyalleri güncel Matriks verisiyle doğrula, geçenleri zenginleştir.
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
    // VIOP kontratları (F_*) live_prices'ta canlı fiyatla duruyor ama SPOT aday
    // DEĞİL (göstergeleri null → zaten sinyal üretmez; bu guard kesinleştirir).
    // F_ fiyatları liveMap'te KALIR (ileride VIOP sizing lookup'ı için).
    .filter((l: any) => !openSymbols.has(l.symbol) && l.last_price > 0 && !isViop(l.symbol))
    .flatMap((l: any) => {
      const distAtr =
        l.atr && l.atr > 0 && l.ema100 != null
          ? (l.last_price - l.ema100) / l.atr
          : null;
      // KURULUM 1 — MEAN_REVERSION: aşırılıktan dönüş beklentisi.
      // Aşırı alım / EMA100 üstüne aşırı sapma → SHORT adayı,
      // aşırı satım / EMA100 altına aşırı sapma → LONG adayı
      const meanRevLong =
        (l.rsi != null && l.rsi <= SCAN_RSI_OVERSOLD) ||
        (distAtr != null && distAtr <= -SCAN_MIN_DIST_ATR);
      const meanRevShort =
        (l.rsi != null && l.rsi >= SCAN_RSI_OVERBOUGHT) ||
        (distAtr != null && distAtr >= SCAN_MIN_DIST_ATR);

      // KURULUM 2 — MOMENTUM_CONTINUATION: güçlü ama aşırı olmayan trend,
      // trend YÖNÜNDE aday (mean-reversion'ı değiştirmeden yanına eklenir)
      const momoLong =
        l.rsi != null && l.rsi >= MOMO_RSI_LONG_MIN && l.rsi <= MOMO_RSI_LONG_MAX &&
        l.lrs != null && l.lrs > 0 &&
        l.aroon_up != null && l.aroon_up >= MOMO_AROON_MIN &&
        distAtr != null && distAtr >= MOMO_DIST_ATR_MIN && distAtr <= MOMO_DIST_ATR_MAX;
      const momoShort =
        l.rsi != null && l.rsi >= MOMO_RSI_SHORT_MIN && l.rsi <= MOMO_RSI_SHORT_MAX &&
        l.lrs != null && l.lrs < 0 &&
        l.aroon_down != null && l.aroon_down >= MOMO_AROON_MIN &&
        distAtr != null && distAtr <= -MOMO_DIST_ATR_MIN && distAtr >= -MOMO_DIST_ATR_MAX;

      const longSetup = meanRevLong || momoLong;
      const shortSetup = meanRevShort || momoShort;
      if (!longSetup && !shortSetup) return [];

      // Açığa satış uygunluğu HER kurulum tipine aynen uygulanır: sembol
      // yalnızca short yönlü adaysa ve short yasaksa listeden çıkar;
      // karışıksa shortOk=false etiketiyle kalır (yalnız LONG değerlendirilir)
      const shortOk = canShort(l.symbol);
      if (!shortOk && shortSetup && !longSetup) return [];

      const setupType = meanRevLong || meanRevShort ? "MEAN_REVERSION" : "MOMENTUM_CONTINUATION";
      const bias = longSetup && shortSetup ? "MIXED" : longSetup ? "LONG" : "SHORT";

      // AŞIRI-UZAMA / TAVAN-TABAN (rejim-duyarlı): adayın hedef yönünde gün-içi
      // hareket eşiği aştıysa havuzdan ÇIKAR (tavan LONG'u dolmaz + kötü R:R; taban
      // SHORT'u aynı). MIXED bırakılır (execution/urgent-check yön-bazlı yakalar).
      // Taban'da LONG "dip alımı" dolabildiği için bloklanmaz.
      if (bias === "LONG" && isDayChangeExtended(l.change_pct, "LONG", entryDayChangeThreshold)) return [];
      if (bias === "SHORT" && isDayChangeExtended(l.change_pct, "SHORT", entryDayChangeThreshold)) return [];

      const rsiExtreme =
        l.rsi != null && (l.rsi <= SCAN_RSI_OVERSOLD || l.rsi >= SCAN_RSI_OVERBOUGHT);

      // Skor: mean-rev uçlaşması + momentumda baskın Aroon kolu + distATR
      const momoArm = momoLong ? l.aroon_up : momoShort ? l.aroon_down : 0;
      const score =
        (rsiExtreme ? Math.abs(l.rsi - 50) : 0) +
        momoArm * 0.4 +
        (distAtr != null ? Math.abs(distAtr) * 10 : 0);

      return [{
        symbol: l.symbol,
        shortOk,
        setupType,
        bias,
        sector: getStaticSector(l.symbol) ?? "BİLİNMİYOR",
        price: l.last_price,
        changePct: l.change_pct != null ? Math.round(Number(l.change_pct) * 100) / 100 : null,
        prevDayChangePct: l.prev_day_change_pct != null ? Math.round(Number(l.prev_day_change_pct) * 100) / 100 : null,
        rsi: l.rsi,
        ema100: l.ema100,
        distAtr: distAtr != null ? Math.round(distAtr * 10) / 10 : null,
        macdDiv: l.macd_div,
        lrs: l.lrs,
        stocRsi: l.stoc_rsi,
        aroonUp: l.aroon_up,
        aroonDown: l.aroon_down,
        score: Math.round(score * 10) / 10,
        // Faz-2 için taşınıyor (BREAKOUT_SETUP / 4H rejim) — prompt/karar kullanmıyor.
        adx: l.adx,
        stochFastK: l.stoch_fast_k,
        stochFastD: l.stoch_fast_d,
        rsi4h: l.rsi_4h,
        ema1004h: l.ema100_4h,
        ema204h: l.ema20_4h,
        ema504h: l.ema50_4h,
        atr4h: l.atr_4h,
        adx4h: l.adx_4h,
        stochFastK4h: l.stoch_fast_k_4h,
        stochFastD4h: l.stoch_fast_d_4h,
      }];
    })
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, SCAN_MAX_SYMBOLS);

  // ── DEĞERLEME BAĞLAMI (Faz-2b Aşama-1 GÖZLEM) ───────────────────────────
  // marketScan adaylarına kompakt değerleme snapshot'ı iliştir. YALNIZCA BAĞLAM:
  // giriş/sizing/stop mantığını ETKİLEMEZ (prompt'ta gösterilir + karara kaydedilir,
  // attribution). Herhangi bir hata → sessizce atla; agent bağlamsız devam eder.
  try {
    const funds = (fundamentalsRes.data ?? []) as FundRow[];
    const fundMap = new Map<string, FundRow>(funds.map((f) => [f.symbol, f]));
    const HOLDING_SECTOR = "HOLDİNGLER VE YATIRIM ŞİRKETLERİ";
    const med = (xs: number[]): number | null => {
      const s = [...xs].sort((a, b) => a - b); const n = s.length;
      return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null;
    };
    const ownHistMap = new Map<string, number>();
    for (const r of (historicalPeRes.data ?? []) as { symbol: string; pe_6m: number | null; pe_1y: number | null; pe_2y: number | null }[]) {
      const m = med([r.pe_6m, r.pe_1y, r.pe_2y].filter((v): v is number => v != null && v > 0 && v < 100));
      if (m != null) ownHistMap.set(r.symbol, m);
    }
    const marketMap = new Map<string, MarketMultiples>();
    const bySectorEE = new Map<string, number[]>();
    for (const l of livePrices as any[]) {
      const m: MarketMultiples = {
        pb: l.pb != null ? Number(l.pb) : null,
        pe: l.pe != null ? Number(l.pe) : null,
        evEbitda: l.ev_ebitda != null ? Number(l.ev_ebitda) : null,
        mktCap: l.mkt_cap != null ? Number(l.mkt_cap) : null,
        firmValue: l.firm_value != null ? Number(l.firm_value) : null,
        sector: l.sector ?? null,
      };
      marketMap.set(l.symbol, m);
      const sec = m.sector;
      if (sec && !FINANCIAL_SECTORS.has(sec) && sec !== HOLDING_SECTOR && m.evEbitda != null && m.evEbitda > 0) {
        if (!bySectorEE.has(sec)) bySectorEE.set(sec, []);
        bySectorEE.get(sec)!.push(m.evEbitda);
      }
    }
    const peerOf = (sec: string | null | undefined): PeerContext => {
      const arr = sec ? bySectorEE.get(sec) : undefined;
      if (arr && arr.length >= 5) return { evEbitdaMedian: med(arr), n: arr.length, scope: "sector" };
      return { evEbitdaMedian: null, n: arr?.length ?? 0, scope: "broad" };
    };
    for (const c of marketScan as any[]) {
      const m = marketMap.get(c.symbol);
      c.valuation = valuationSnapshot(fundMap.get(c.symbol), c.price ?? null, m, peerOf(m?.sector), ownHistMap.get(c.symbol) ?? null);
    }
  } catch (e) {
    console.warn("valuation snapshot atlandı:", e instanceof Error ? e.message : e);
  }

  // ── TAVAN-SERİSİ KATALİZÖR KONTROLÜ (2026-08-28) ─────────────────────────
  // SHORT adayı bir TAVAN SERİSİNE (ardışık +tavan) denk geliyorsa güçlü katalizör
  // işaretidir → on-demand tek-hisse haber kontrolü çalışır (web_search/KAP) → agent'a
  // KANIT olarak gider. EXIT-TRAP: kilitli tavanda short cover edilemez, stop çalışmaz.
  // DETERMİNİSTİK tetik (LLM'e bırakılmaz); yalnız SHORT/MIXED + seri olan adaylara;
  // hata → sessizce atla (agent bağlamsız devam etsin, asla bloklanmasın).
  try {
    const shortCands = (marketScan as any[]).filter((c) => c.bias === "SHORT" || c.bias === "MIXED");
    if (shortCands.length) {
      const { data: hist } = await supabase
        .from("daily_change_history")
        .select("symbol,change_pct")
        .in("symbol", shortCands.map((c) => c.symbol))
        .order("trade_date", { ascending: false });
      const histBySym = new Map<string, number[]>();
      for (const h of (hist ?? []) as { symbol: string; change_pct: number | null }[]) {
        if (h.change_pct == null) continue;
        if (!histBySym.has(h.symbol)) histBySym.set(h.symbol, []);
        histBySym.get(h.symbol)!.push(Number(h.change_pct));
      }
      const seriesCands = shortCands
        .map((c) => {
          // Geçmiş: daily_change_history (t-1..t-5). Tablo henüz boşsa (geçiş dönemi)
          // t-1 için live_prices.prev_day_change_pct'e düş → 2-gün bugün çalışır.
          // Tablo dolunca history kullanılır (prev_day ile çakışma/çift-say olmaz).
          const hArr = histBySym.get(c.symbol);
          const history = hArr && hArr.length ? hArr : (c.prevDayChangePct != null ? [c.prevDayChangePct] : []);
          return { c, series: detectTavanSeries(c.changePct, history) };
        })
        .filter((x) => x.series.isSeries);
      // Katalizör kontrolleri paralel (nadir tetiklenir; genelde 0 aday).
      await Promise.all(seriesCands.map(async ({ c, series }) => {
        c.tavanSeries = tavanSeriesSummary(series);
        c.catalyst = await checkSingleStockCatalyst(c.symbol, c.tavanSeries, "SHORT");
      }));
    }
  } catch (e) {
    console.warn("tavan-serisi katalizör kontrolü atlandı:", e instanceof Error ? e.message : e);
  }

  // Aylık realized PnL
  const realizedPnl = closedThisMonth.reduce((sum: number, p: any) => sum + (p.pnl_amount ?? 0), 0);

  // Kümülatif (tüm-zaman) realized PnL — sadece PF raporunda ön bilgi olarak sunulur; hedef/karar aylık üzerinden.
  const cumulativeRealizedPnl = closedAllTime.reduce((sum: number, p: any) => sum + (p.pnl_amount ?? 0), 0);

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

    const base = {
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
      // Faz-2 için taşınıyor (BREAKOUT_SETUP / 4H rejim) — prompt/karar kullanmıyor.
      adx: live?.adx,
      stochFastK: live?.stoch_fast_k,
      stochFastD: live?.stoch_fast_d,
      rsi4h: live?.rsi_4h,
      ema1004h: live?.ema100_4h,
      ema204h: live?.ema20_4h,
      ema504h: live?.ema50_4h,
      atr4h: live?.atr_4h,
      adx4h: live?.adx_4h,
      stochFastK4h: live?.stoch_fast_k_4h,
      stochFastD4h: live?.stoch_fast_d_4h,
      entryScore: (p.quality_score ?? p.ai_score ?? null) as number | null,
    };
    // Tutma sağlığı skoru — SWAP karşılaştırmasının zemini (aday kalitesiyle
    // aynı 0-100 ölçeğinde). Prompt hem gösterir hem en zayıfı işaretler.
    const health = computePositionHealth(base);
    return { ...base, ...health };
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

  // En zayıf açık pozisyon (tutma sağlığına göre) — SWAP'ın "kimi çıkar" ucu.
  const weakestPosition = enrichedPositions.length
    ? enrichedPositions.reduce((a, b) => (a.healthScore <= b.healthScore ? a : b))
    : null;

  // Deterministik SWAP adayları: yalnızca TradingView havuzu (gerçek 0-100
  // quality_score taşır; marketScan'in score'u farklı ölçekte, buraya girmez).
  // Aday kalitesi, en zayıf pozisyonun sağlığını >= SWAP_MIN_QUALITY_GAP geçmeli.
  const swapCandidates = weakestPosition
    ? opportunityPool
        .filter(
          (o: any) =>
            typeof o.qualityScore === "number" &&
            o.qualityScore - weakestPosition.healthScore >= SWAP_MIN_QUALITY_GAP
        )
        .map((o: any) => ({
          candidateSymbol: o.symbol,
          candidateSide: o.side,
          candidateQuality: o.qualityScore,
          outSymbol: weakestPosition.symbol,
          outHealth: weakestPosition.healthScore,
          gap: Math.round(o.qualityScore - weakestPosition.healthScore),
        }))
        .sort((a: any, b: any) => b.gap - a.gap)
    : [];

  // Haber/temel bağlam (İZOLE üretilen son not) — kill-switch'e bağlı.
  let newsContext: any = null;
  if (NEWS_CONTEXT_ENABLED) {
    const { data: nc } = await supabase
      .from("news_context")
      .select("scan_at,scan_slot,note_type,content,summary,regime,confidence_kesin,confidence_raporlu,confidence_anlati,model")
      .order("scan_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    newsContext = nc ?? null;
  }

  return {
    positions: enrichedPositions,
    newsContext,
    weakestPositionSymbol: weakestPosition?.symbol ?? null,
    swapCandidates,
    opportunityPool,
    marketScan,
    marketContext,
    entryRegime,
    entryDayChangeThreshold,
    sectorExposure,
    totalAllocated: Math.round(totalAllocated * 100) / 100,
    availableCapital: Math.round((ACCOUNT_CAPITAL - totalAllocated) * 100) / 100,
    availableSlots: MAX_OPEN_POSITIONS - positions.length,
    realizedPnl: Math.round(realizedPnl * 100) / 100,
    cumulativeRealizedPnl: Math.round(cumulativeRealizedPnl * 100) / 100,
    cumulativeClosedCount: closedAllTime.length,
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
  const mc = data.marketContext;
  const marketContextLine = mc?.available
    ? `PİYASA BAĞLAMI (XU100): Fiyat ${mc.price?.toFixed(0)} | Günlük %${mc.changePct >= 0 ? "+" : ""}${mc.changePct?.toFixed(2)} | RSI ${mc.rsi?.toFixed(1) ?? "?"} | EMA20 ${mc.ema20?.toFixed(0) ?? "?"} / EMA50 ${mc.ema50?.toFixed(0) ?? "?"} / EMA100 ${mc.ema100?.toFixed(0) ?? "?"} | LRS ${mc.lrs?.toFixed(3) ?? "?"} | ATR ${mc.atr?.toFixed(1) ?? "?"}`
    : "PİYASA BAĞLAMI: veri yok (endeks verisi bayat/eksik — seans öncesi olabilir; rejim sınıflandırmasını 'BELİRSİZ' say)";

  // TEMEL BAĞLAM (haber katmanı) — tazelik kapısı: 30 saatten eski not göz ardı
  // (hafta sonu/tarama boşluğu). Kill-switch kapalıysa data.newsContext null gelir.
  const nc = data.newsContext;
  const ncAgeMin = nc ? Math.round((Date.now() - new Date(nc.scan_at).getTime()) / 60000) : Infinity;
  const newsBlock =
    nc && ncAgeMin <= 30 * 60
      ? `
TEMEL BAĞLAM (haber/temel katman — İZOLE üretildi · ${nc.model ?? "?"} · ${ncAgeMin < 90 ? ncAgeMin + " dk" : Math.round(ncAgeMin / 60) + " saat"} önce):
Rejim: ${nc.regime ?? "-"} · Güven: KESİN ${nc.confidence_kesin}/RAPORLU ${nc.confidence_raporlu}/ANLATI ${nc.confidence_anlati}
${nc.content}

TEMEL BAĞLAM DİSİPLİNİ (over-weighting'e karşı — KRİTİK):
- TEKNİK BİRİNCİL, haber MODİFİYE EDİCİ. Karar teknikten gelir; haber bağlam/çekince ekler. Çelişkide TEKNİK KAZANIR — haber tek başına bir kararı FLIP EDEMEZ.
- Yalnız KESİN/RAPORLU haber aksiyonu etkileyebilir; ANLATI görünür ama INERT (yalnız çapraz-referans, tek başına gerekçe olamaz).
- Bir kararı haber ETKİLEDİYSE gerekçende HANGİ maddeyi + güven-etiketini kullandığını YAZ (şeffaflık ZORUNLU).
- Seviye-3: haber DİKKATİ yönlendirir (sektör/tema), TEKNİK girişi teyit eder. Haberle sembol İCAT ETME; teknik aday yoksa "tema lehte ama teknik giriş yok, izliyorum".
- Yön/fiyat tahmini YOK; "piyasa çoktan fiyatladı mı" sor; karşı-kuvvetleri tart.`
      : "";

  return `Sen TIOS'un (Trading Intelligence & Operations System) yapay zeka destekli portföy yöneticisisin.

GÖREV:
Kullanıcının BIST portföyünü profesyonel bir fon yöneticisi gibi yönetmek.
Kararlarını Supabase'e yaz, Telegram'a bildir.
Kullanıcı sadece aylık hedefi belirler ve sonuçları izler.

${marketContextLine}
${newsBlock}
PORTFÖY DURUMU (${new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}):

AÇIK POZİSYONLAR (${data.positions.length}/${data.maxPositions}):
${data.positions.map((p: any) => `
  ${p.symbol} | ${p.side} | Giriş: ${p.entryPrice} | Güncel: ${p.currentPrice} | PnL: %${p.pnlPct} (${p.pnlAmount} TL) | Sağlık: ${p.healthScore}/100${data.weakestPositionSymbol === p.symbol ? " ⬅ EN ZAYIF" : ""}
  Gün: ${p.daysOpen} | Stop: ${p.stopPrice} | TP1: ${p.tp1Price} | Stage: ${p.trailingStage} | Dönüş ihtimali: %${p.reversalProbability} | Motor önerisi: ${p.suggestedAction === "REDUCE" ? "İZLE (dönüş riski — kısmi kesme YOK, trailing yönetir)" : p.suggestedAction}
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

SWAP ADAYLARI (deterministik — havuz adayının kalitesi, en zayıf pozisyonun tutma-sağlığını ≥${SWAP_MIN_QUALITY_GAP} puan geçenler):
${data.swapCandidates.length === 0
  ? "  (Yok — hiçbir havuz adayı eşiği geçmiyor. Bu turda SWAP ÖNERME.)"
  : data.swapCandidates.map((s: any) => `  ${s.candidateSymbol} (${s.candidateSide}, kalite ${s.candidateQuality}) ⟶ KAPAT ${s.outSymbol} (sağlık ${s.outHealth}) · fark +${s.gap}`).join("\n")}

CANLI PİYASA TARAMASI (Matriks — doğrudan, ön onaysız):
NOT: Piyasa rejimi ${data.entryRegime === "TREND" ? "GÜÇLÜ TREND" : "YATAY/SIKIŞIK"} (XU100) → aşırı-uzama eşiği %${data.entryDayChangeThreshold}. Hedef yönünde gün-içi hareketi ("Günlük %") bu eşiği aşan (tavan/taban yakını) adaylar listeden OTOMATİK ÇIKARILDI — o bölgede yeni açılış hem R:R'ı bozar hem de emir dolmaz. Buradaki adaylar eşik altında; yine de "Günlük %" eşiğe yakınsa temkinli ol. "Dün %": bir önceki günün kapanış değişimi — dün tavana yakın (±%8+) kapanmış bir hisse bugün sakin görünse de uzamış/riskli olabilir; gerekçende dikkate al.
${data.marketScan.length === 0
  ? "  (Boş — tarama kriterlerine uyan sembol yok.)"
  : data.marketScan.map((m: any) => `
  ${m.symbol} | Kurulum: ${m.setupType} → ${m.bias} | Sektör: ${m.sector} | Short: ${m.shortOk ? "uygun" : "YASAK"} | Fiyat ${m.price} | Günlük %${m.changePct != null ? (m.changePct >= 0 ? "+" : "") + m.changePct : "?"} | Dün %${m.prevDayChangePct != null ? (m.prevDayChangePct >= 0 ? "+" : "") + m.prevDayChangePct : "?"} | RSI ${m.rsi?.toFixed(1) ?? "?"} | EMA100 ${m.ema100?.toFixed(2) ?? "?"} | distATR ${m.distAtr != null ? (m.distAtr >= 0 ? "+" : "") + m.distAtr : "?"} | MACD ${m.macdDiv?.toFixed(4) ?? "?"} | LRS ${m.lrs?.toFixed(3) ?? "?"} | StocRSI ${m.stocRsi?.toFixed(1) ?? "?"} | Aroon ↑${m.aroonUp?.toFixed(0) ?? "?"}/↓${m.aroonDown?.toFixed(0) ?? "?"}${m.valuation ? `
    📊 Değerleme(GÖZLEM): ${m.valuation.summary}` : ""}${m.catalyst ? `
    🚨 TAVAN-SERİSİ KATALİZÖR KONTROLÜ: ${m.tavanSeries} → ${m.catalyst.summary || "(kontrol yapıldı)"} | SHORT verdikti: ${m.catalyst.shortVerdict ?? "?"} (güven: ${m.catalyst.confidence ?? "?"})` : ""}
`).join("")}

TAVAN-SERİSİ / SHORT GÜVENLİK KURALI (bağlayıcı): Bir SHORT adayında "🚨 TAVAN-SERİSİ KATALİZÖR" satırı varsa DİKKATLE oku. Ardışık tavan güçlü bir KATALİZÖR (dava/M&A/sermaye-artırımı/KAP açıklaması) işaretidir ve teknik körlükle short açmak EXIT-TRAP'tir: kilitli tavanda short'u COVER EDEMEZSİN, stop-loss FİİLEN ÇALIŞMAZ, seri kaç gün süreceği öngörülemez → yönetilemez zarar. KURAL: verdikt **TEHLİKELİ** (güven KESİN/RAPORLU) ise bu SHORT'u **AÇMA** — ne kadar güçlü aşırı-alım/gösterge teyidi olursa olsun. **BELİRSİZ** ise çok temkinli ol. **GÜVENLİ** (katalizör yok) ise teknik-uzama olabilir, normal değerlendir. Bu, değerleme-gözlem katmanından FARKLI: burada verdikt kararını ETKİLER (dar, kanıt-kapılı güvenlik kontrolü).

DEĞERLEME BAĞLAMI — GÖZLEM MODU (Faz-2b Aşama-1): Yukarıdaki "📊 Değerleme" satırları temel-analiz BAĞLAMIDIR — kararını DEĞİŞTİRMEZ. Giriş kararını yine YALNIZCA teknik kurulum + R:R + rejim/güvenceler üzerinden ver; sizing/stop'a değerleme KARIŞMAZ. Güçlü teknik sinyal varsa değerleme "pahalı" olsa da giriş yaparsın. Yalnızca FARKINDA ol; istersen gerekçende tek cümleyle değinebilirsin (ör. "homojen sektörde adil-üstü, izlenecek"). "güven:düşük" ise (heterojen sektör/çevrimsel) değerlemeyi hiç ciddiye alma. Bu katman şu an ölçüm için kaydediliyor.

SERMAYE:
  Toplam: ${data.accountCapital.toLocaleString("tr-TR")} TL
  Kullanılan: ${data.totalAllocated.toLocaleString("tr-TR")} TL
  Boş: ${data.availableCapital.toLocaleString("tr-TR")} TL
  Boş Slot: ${data.availableSlots}

AYLIK PERFORMANS (${data.monthInfo.daysElapsed}. gün, ${data.monthInfo.daysRemaining} gün kaldı):
  Aylık (bu ay) realized PnL: ${data.realizedPnl.toLocaleString("tr-TR")} TL / Hedef: ${data.goal.realizedTarget.toLocaleString("tr-TR")} TL (%${data.goal.realizedTargetPct}) — HEDEF/DEĞERLENDİRME BUNUN ÜZERİNDEN
  Kümülatif (tüm-zaman) realized PnL: ${data.cumulativeRealizedPnl.toLocaleString("tr-TR")} TL (${data.cumulativeClosedCount} kapanış, hesap açılışından beri — yalnızca bağlam)
  Toplam PnL: ${data.totalPnl.toLocaleString("tr-TR")} TL / Hedef: ${data.goal.totalTarget.toLocaleString("tr-TR")} TL (%${data.goal.totalTargetPct})
  Bu ay kapanan: ${data.closedThisMonth} işlem
  Ay ilerlemesi: %${data.monthInfo.monthProgress}
  NOT (değerlendirme raporu için): İki rakamlı ön bilgi (Aylık + Kümülatif) rapor başına OTOMATİK ekleniyor — summary'de bunları TEKRAR yazma. summary/monthlyOutlook yorumunu YALNIZCA aylık (bu ay) realized üzerinden yap; kümülatif yalnız geçmiş bağlam, hedef ölçümüne girmez, prose'da kümülatif rakam belirtme.

HEDEF VE LİMİTLER:
  Aylık realized hedef: %${data.goal.realizedTargetPct}
  Aylık toplam hedef: %${data.goal.totalTargetPct}
  Max drawdown: %${data.goal.maxDrawdownPct}
  Günlük max drawdown: %${data.goal.dailyMaxDrawdownPct}
  Max sektör exposure: %${data.goal.maxSectorExposurePct}

KARAR YETKİLERİN:
- Pozisyon KAPAT (tam çıkış — kurulum tümüyle bozuldu, sert/teyitli dönüş, stop kritik)
- Yeni pozisyon ÖNERİ (sadece öneri, bağlantı açma yok)
- SWAP (rotasyon): slot doluyken en zayıf/sağlıksız pozisyonu KAPAT + yerine daha
  yüksek kaliteli adayı AÇ — YALNIZCA "SWAP ADAYLARI" bloğunda listelenen eşleşmeler için
- HOLD (bekle, izle)
- Hedging önerisi (mevcut portföy riskine ZIT yönde pozisyon önerisi)
NOT: "AZALT/REDUCE" (kısmi satış) yetkisi KALDIRILDI. Kısmi kâr-alma tamamen
mekanik modelin işi: sistem TP1'de (+%10) otomatik %25 satar, kalanı sürekli
trailing ile korur/koşturur. Sen kısmi satış ÖNERME — bir kazananda tek meşru
aksiyonun ya HOLD (trailing yönetsin) ya da GERÇEK bozulmada tam CLOSE'dur.

KAZANANI KOŞTURMA DİSİPLİNİ (R:R matematiği — KRİTİK):
Sistem winrate ~%40. Bu oranda kâr etmek için kazançların kayıplardan ~2× büyük
olması ŞART (R:R ≥ ~2). Kazanan bir pozisyonu küçük kârla erken kesmek bu matematiği
KIRAR: küçük kazanç + büyük kayıp = kümülatifte kaybeden sistem.
- Kârdaki bir pozisyonu SADECE "biraz yeşil / küçük kâr fırsatı" diye KAPATMA.
  Sürekli trailing stop (best − ATR-makas, ~%3-5) kârı ZATEN otomatik korur; fiyat
  dönerse stop kendisi kilitler — senin erken satmana gerek yok. Kısmi satış zaten
  senin yetkinde DEĞİL (TP1'de sistem otomatik %25 satar).
- "Dönüş ihtimali yüksek" veya "RSI aşırı alım" TEK BAŞINA çıkış gerekçesi DEĞİLDİR —
  bunlar trailing'in yöneteceği normal dalgalanmadır. Kısmi kesmek için değil, ancak
  TAM bir CLOSE'u haklı çıkaracak kadar GÜÇLÜYSE (kurulum tümüyle çöktü + çok göstergeli
  teyitli sert dönüş VEYA stop-yakınlığı kritik) tam çıkış öner.
- Gerekçende çıkış için SOMUT ve GÜÇLÜ dönüş/risk kanıtı göster (hangi göstergeler).
  Somut kanıt yoksa kazananı TUT (HOLD). "Kârı realize et" / "RSI yüksek" / "TP1'e
  yakın" tek başına yeterli gerekçe DEĞİLDİR.
- Bu disiplin yalnızca KAZANANLAR içindir. Zarardaki/kurulumu bozulan pozisyonu
  eskisi gibi tam kapat — orada erken çıkış doğrudur.

YÖN BAĞIMSIZLIĞI KURALI:
Mevcut açık pozisyonların yönü (LONG/SHORT dağılımı) YENİ önerilerin yönünü
belirlemede KULLANILMAMALI. Her aday KENDİ sinyaline göre bağımsız
değerlendirilir — portföyün mevcut kompozisyonuna "tutarlı" olmak diye bir
hedef YOKTUR. Portföy hem LONG hem SHORT taşıyabilir. Mevcut bir pozisyonun
riskini azaltmak için ZIT yönde hedge önermek de meşru bir stratejidir.

PORTFÖY BAĞLAM DİSİPLİNİ:
Yeni öneri değerlendirirken mevcut portföyle etkileşimi gerekçende BİR CÜMLEYLE
görünür kıl (bu öneriyi engellemek zorunda DEĞİL, ama şeffaf olmalı):
- Aynı sektöre yoğunlaşma (max sektör exposure limitine yaklaşma),
- Mevcut pozisyonlarla aynı yöne aşırı yüklenme (örn. 7/8 SHORT'ken 8. SHORT
  önerisinin portföy-düzeyi tek-yön riski),
- Birbirini hedge eden/çelişen pozisyonlar (aynı sektörde eşzamanlı LONG+SHORT;
  örn. YKBNK LONG dururken bankacılık SHORT'u önermek).
Yön bağımsızlığı kuralıyla çelişmez: yön yine adayın kendi sinyalinden gelir,
bu sadece portföy-düzeyi riski gerekçede görünür kılmak içindir.

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

SWAP DİSİPLİNİ:
- SWAP YALNIZCA "SWAP ADAYLARI" bloğunda listelenmiş bir eşleşme için önerilebilir.
  Blok "(Yok...)" ise bu turda SWAP ÖNERME — kendi kafandan pozisyon-aday eşleştirme.
- Kapatılacak (out) pozisyon ile açılacak (in) aday, SWAP ADAYLARI bloğundaki
  eşleşmeye birebir uymalı; gerekçende kalite farkını (+puan) mutlaka yaz.
- İSTİSNA — taze/sağlıklı out pozisyonu koru: en zayıf pozisyon sağlık skoru düşük
  olsa bile yeni açılmışsa, momentumu güçlüyse veya hedefe ilerliyorsa (motor önerisi
  HOLD/INCREASE) SWAP'tan kaçın; eşik geçilse dahi neden tutmayı seçtiğini bir cümleyle yaz.
- SWAP takdiri kaldırmaz, çıpalar: nihai onay kullanıcıya (Telegram) gider.
- AÇIĞA SATIŞ KURALI: SHORT önerisi yalnızca açığa satışa uygun sembollerde
  verilebilir. Taramada "Short: YASAK" işaretli sembollere ASLA SHORT önerme
  (bu semboller yalnızca LONG değerlendirilebilir). Havuzdaki SHORT adaylar
  zaten uygunluk filtresinden geçmiştir.
- SHORT EKSTRA TEMKİN: SHORT önerilerine LONG'dan DAHA YÜKSEK çıta uygula.
  LONG için "en az 2-3 gösterge teyidi" yeterken, SHORT için EN AZ 4 GÜÇLÜ
  göstergenin (RSI, MACD, LRS, Aroon, distATR, StocRSI arasından) aynı AŞAĞI
  yönü net biçimde hizalamasını ŞART koş; zayıf veya kısmi teyitle SHORT önerme.
  Ayrıca rejim TRENDLİ-AŞAĞI DEĞİLSE (YATAY-SIKIŞIK / TRENDLİ-YUKARI / BELİRSİZ
  ise) SHORT'tan genel olarak KAÇIN; buna rağmen SHORT öneriyorsan gerekçende bu
  rejimde neden istisna yaptığını AÇIKÇA savun. Bu katman YÖN BAĞIMSIZLIĞI
  KURALI'nı geçersiz KILMAZ — SHORT yasağı değil, yalnızca SHORT'a ekstra kanıt
  yükü; LONG çıtası ve yön bağımsızlığı aynen geçerli.
- KURULUM ETİKETİ: Taramadaki her aday bir kurulum tipi taşır:
  * MEAN_REVERSION = aşırılıktan dönüş beklentisi → aşırılığın TERSİNE öneri
  * MOMENTUM_CONTINUATION = güçlü ama aşırı olmayan sağlıklı trend → trend
    YÖNÜNDE öneri (→ LONG/SHORT bias etiketi yönü gösterir)
  Önerinin gerekçesinde hangi kurulum mantığıyla önerdiğini AÇIKÇA belirt.
  "En az 2-3 gösterge teyidi" şartı her iki kurulum tipi için de geçerlidir.
- PİYASA REJİMİ SINIFLANDIRMASI: Analize başlamadan XU100 PİYASA BAĞLAMI'nı
  (EMA20/50/100 dizilimi + LRS + günlük değişim + volatilite/ATR) değerlendirip
  rejimi belirle: TRENDLİ-YUKARI / TRENDLİ-AŞAĞI / YATAY-SIKIŞIK /
  YÜKSEK-VOLATİLİTE (PİYASA BAĞLAMI "veri yok" ise BELİRSİZ). Bu sınıflandırmayı
  "summary" alanının İLK cümlesi yap (reportOnly raporunun başında görünsün).
  Kurulum önceliğini rejime göre ayarla:
  * TRENDLİ piyasada MOMENTUM_CONTINUATION kurulumlarına öncelik ver; trende
    KARŞI MEAN_REVERSION önerisi için ekstra güçlü dönüş teyidi ara ve
    gerekçende bunu açıkça savun.
  * YATAY-SIKIŞIK piyasada MEAN_REVERSION öncelikli; momentum kurulumlarına
    şüpheyle yaklaş (sıkışık piyasada kırılımlar sık başarısız olur).
  * YÜKSEK-VOLATİLİTE rejiminde yeni pozisyon önerilerinde genel olarak daha
    seçici ol ve bunu gerekçende belirt.
  * BELİRSİZ rejimde temkinli davran, rejime dayalı öncelik iddiasında bulunma.
- SİNYAL ÇATIŞMASI: Bir sembolde göstergeler çelişiyorsa (örn. RSI aşırı satım
  ama LRS güçlü negatif + Aroon düşüş teyidi) çelişkiyi gerekçende AÇIKÇA
  adlandır. Çelişkili sinyalli sembol için ya öneri YAPMA ya da DÜŞÜK GÜVEN
  (urgency: LOW) ile öner ve hangi göstergenin neden baskın olduğunu savun.
  "Aşırı satım" tek başına dönüş garantisi DEĞİLDİR — düşen bıçağı dönüş
  kurulumundan ayıran şey momentum/trend göstergelerindeki teyittir.
- İKİ YÖNLÜ DEĞERLENDİRME: RECOMMEND_OPEN değerlendirirken, havuzdaki/
  taramadaki en güçlü LONG adayı ile en güçlü SHORT adayını KISACA
  karşılaştır — hangisini seçersen seç, diğer yöndeki en iyi adayı neden
  tercih etmediğini gerekçende bir cümleyle belirt. Bu, piyasa yönüne
  bakılmaksızın her iki tarafı da bilinçli değerlendirdiğini gösterir.
- GEÇERSİZLEME KOŞULU: Her RECOMMEND_OPEN gerekçesinin sonuna tek cümlelik
  geçersizleme koşulu ekle: "Bu kurulum şu durumda geçersiz olur: ..." (örn.
  "fiyat X seviyesi altına günlük kapanış yaparsa" / "RSI 50 üstüne dönmeden
  LRS pozitife geçerse"). Bu, önerinin hangi varsayıma dayandığını netleştirir.
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
      "type": "CLOSE|SWAP|RECOMMEND_OPEN|HOLD|HEDGE",
      "symbol": "SEMBOL",
      "reason": "kısa sebep",
      "details": "detaylı açıklama",
      "urgency": "HIGH|MEDIUM|LOW",
      "side": "LONG|SHORT (sadece RECOMMEND_OPEN/SWAP için zorunlu)",
      "source": "TRADINGVIEW_POOL|MATRIKS_SCREENING (sadece RECOMMEND_OPEN/SWAP için zorunlu)",
      "setupType": "MEAN_REVERSION|MOMENTUM_CONTINUATION|BREAKOUT_SETUP|TV_SIGNAL (sadece RECOMMEND_OPEN/SWAP)"
    }
  ],
  "regime": "TRENDLİ-YUKARI|TRENDLİ-AŞAĞI|YATAY-SIKIŞIK|YÜKSEK-VOLATİLİTE|BELİRSİZ",
  "summary": "genel portföy değerlendirmesi",
  "monthlyOutlook": "aylık hedefe ulaşma tahmini"
}
setupType KURALI (UYDURMA): Aday MATRIKS_SCREENING'den ise setupType'ı taramadaki
"Kurulum" etiketinden AYNEN yaz. TRADINGVIEW_POOL'dan ise "TV_SIGNAL" yaz (o havuz
kurulum tipi üretmez). Emin değilsen alanı BOŞ bırak — en yakın tipi TAHMİN ETME.
"regime" alanını summary'nin ilk cümlesindeki rejimle AYNI tut (yapısal kayıt).` : `SOHBET MODU:
Kullanıcı ile serbest sohbet ediyorsun. Yanıtını DÜZ TÜRKÇE METİN olarak ver.
JSON, kod bloğu veya karar formatı KULLANMA.
CLOSE/SWAP/RECOMMEND_OPEN gibi karar ÜRETME — soruları yukarıdaki portföy
verisine dayanarak bilgilendirici şekilde cevapla. Kısa ve net ol; kullanıcı
detay isterse derinleş.

AKSİYON NİYETİ PROTOKOLÜ (tek istisna):
Kullanıcı NET bir pozisyon aksiyonu TALEP EDİYORSA (belirli bir sembol için
kapat/azalt/swap veya yeni pozisyon aç isteği), normal cevabının EN SONUNA
şu formatta TEK satır ekle (cevabın başka hiçbir yerinde köşeli parantezli
blok kullanma):
[ACTION]{"type":"CLOSE|SWAP|RECOMMEND_OPEN","symbol":"SEMBOL","side":"LONG|SHORT","reason":"kısa gerekçe"}
- "side" RECOMMEND_OPEN için ZORUNLU; CLOSE/SWAP'ta mevcut pozisyonun yönü.
- Bu satırı YALNIZCA niyet APAÇIKSA ekle: "GARAN pozisyonunu kapat" → ekle.
  "GARAN nasıl gidiyor?", "kapatsam mı sence?" gibi bilgi/görüş soruları
  AKSİYON DEĞİLDİR → EKLEME. Emin değilsen EKLEME ve kullanıcıdan netleştirme iste.
- Marker eklesen de cevabında onay sürecini anlatma — sistem, önerinin
  Telegram onayına gönderildiği bilgisini otomatik ekler. Hiçbir aksiyon
  kullanıcı Telegram'da onaylamadan uygulanmaz.`}

TÜRKÇE konuş. Profesyonel ama anlaşılır ol. Gereksiz teknik jargondan kaçın.
Sadece gerçek veriye dayan, tahmin üretme.`;
}

// ---------------------------------------------------------------------------
// Agent modu — günlük analiz
// ---------------------------------------------------------------------------

async function runAgent(reportOnly = false, triggerSource = "manual_agent") {
  try {
    // Katman 2 — bayat-veri guard'ı: karar üreten (reportOnly OLMAYAN) akışta,
    // FEED KESİNTİSİ GUARD (2026-08-24 sıkılaştırıldı): yeni-pozisyon/karar üretme
    // için SIKI eşik (ENTRY_FRESHNESS 15dk) + ÇOĞUNLUK bayat (≥ MIN_STALE_COUNT,
    // "TÜM 6" yerine) → feed donmuşsa (DDE kesintisi gibi) agent aksiyon almaz.
    // reportOnly MUAF (analiz cevaplanabilsin; aşağıda uyarı eklenir).
    const freshness = await getDataFreshness(ENTRY_FRESHNESS_THRESHOLD_MINUTES);
    if (!reportOnly && freshness.ok && freshness.staleCount >= ENTRY_FRESHNESS_MIN_STALE_COUNT) {
      const newest = formatTradeTimeTR(freshness.newestTradeTime);
      console.warn(`AGENT_SKIPPED_STALE_DATA — ${freshness.staleCount}/${freshness.symbols.length} bayat, son ${newest}`);
      await supabase.from("agent_run_log").insert({
        mode: "agent",
        trigger_source: triggerSource,
        decisions: [],
        decision_count: 0,
        summary: `SKIPPED_STALE_DATA: ${freshness.staleCount}/${freshness.symbols.length} referans sembol ${freshness.thresholdMinutes}+ dk bayat (feed akmıyor, son ${newest}) — karar üretilmedi`,
        portfolio_snapshot: { freshness: { staleCount: freshness.staleCount, allStale: freshness.allStale, newestTradeTime: freshness.newestTradeTime, thresholdMinutes: freshness.thresholdMinutes } },
      });
      return NextResponse.json({
        ok: true,
        skipped: "SKIPPED_STALE_DATA",
        newestTradeTime: freshness.newestTradeTime,
        thresholdMinutes: freshness.thresholdMinutes,
      });
    }

    const data = await fetchPortfolioData();
    const systemPrompt = buildSystemPrompt(data);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
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

    // Rapor kartı için DETERMİNİSTİK ön bilgi: aylık + kümülatif realized ayrı
    // etiketle summary'nin başına eklenir. (LLM prose'una bırakılınca kümülatif
    // düşüyordu — kullanıcı raporda göremiyordu.) Hedef/karar hala yalnız aylık.
    if (parsed && typeof parsed.summary === "string" && parsed.summary.trim() && !parsed.summary.startsWith("📊 Realized PnL")) {
      const preamble =
        `📊 Realized PnL — Aylık (bu ay): ${data.realizedPnl.toLocaleString("tr-TR")} TL · ` +
        `Kümülatif (tüm-zaman): ${data.cumulativeRealizedPnl.toLocaleString("tr-TR")} TL ` +
        `(${data.cumulativeClosedCount} kapanış, hesap açılışından beri — hedef ölçümü yalnız aylık üzerinden).`;
      parsed.summary = `${preamble}\n\n${parsed.summary}`;
    }

    // Sembol-düzeyi soğuma (churn emniyet kemeri) — yalnızca karar üreten akış.
    // reportOnly MUAF (rapor kartı ham analizi görmeli). Engellenen kararlar
    // suppressed_by ile işaretlenir; aynı obje referansı olduğu için aşağıdaki
    // agent_run_log kaydında da görünür.
    let cooldownKeptActionable: any[] | null = null;
    if (!reportOnly) {
      const actionable0 = decisions.filter((d: any) => APPROVAL_TYPES.includes(d.type));
      const { kept, suppressed } = await applyCooldownFilter(actionable0);
      for (const s of suppressed) s.decision.suppressed_by = s.reason;
      cooldownKeptActionable = kept;
      if (suppressed.length > 0) {
        console.log(`AGENT_COOLDOWN_SUPPRESSED ${suppressed.map((s) => `${s.decision.type}:${s.decision.symbol}/${s.reason}`).join(", ")}`);
      }
    }

    // Gözlemlenebilirlik: HER çalıştırmanın (reportOnly dahil) HAM karar seti
    // loglanır (soğuma engellenenlerde suppressed_by işaretiyle). Log hatası
    // çalışmayı durdurmaz.
    const { error: runLogError } = await supabase.from("agent_run_log").insert({
      mode: reportOnly ? "report_only" : "agent",
      trigger_source: triggerSource,
      decisions,
      decision_count: decisions.length,
      summary: parsed?.summary ?? null,
      monthly_outlook: parsed?.monthlyOutlook ?? null,
      portfolio_snapshot: {
        openPositions: data.positions.length,
        poolSize: data.opportunityPool.length,
        scanSize: data.marketScan.length,
        realizedPnl: data.realizedPnl,
        totalPnl: data.totalPnl,
      },
    });
    if (runLogError) console.error("AGENT_RUN_LOG_ERROR", runLogError.message);

    let pendingRows: any[] = [];

    // reportOnly modunda hiçbir yan etki üretilmez: ai_decisions kaydı yok,
    // Telegram bildirimi yok — sadece analiz sonucu döner (rapor kartı için).
    if (!reportOnly) {

    // Onay gerektiren kararlar PENDING olarak kaydedilir — pozisyonlara
    // dokunulmaz. Uygulama, telegram-webhook (onay) veya
    // telegram-reminder-check (süre dolunca) üzerinden yapılır.
    const actionable = cooldownKeptActionable ?? [];

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
          // valuation: giriş anındaki değerleme snapshot'ı (Aşama-1 gözlem/attribution)
          details: { detail: d.details, urgency: d.urgency, source: d.source ?? null, valuation: (scan as any)?.valuation ?? null, catalyst: (scan as any)?.catalyst ?? null, tavanSeries: (scan as any)?.tavanSeries ?? null },
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

      pendingRows = await insertPendingDecisions(rows);
    }

    // Özet raporu (butonsuz)
    await sendTelegramAgentReport(decisions, parsed?.summary, parsed?.monthlyOutlook, data);

    // Her PENDING karar için onay butonlu ayrı mesaj
    for (const dec of pendingRows) {
      await notifyPendingDecision(dec);
    }

    } // if (!reportOnly)

    // reportOnly muaf ama bayat veriyle çalışıldıysa summary'ye uyarı eklenir
    const staleWarning =
      freshness.ok && freshness.allStale
        ? `⚠️ Veri bayat olabilir (son güncelleme: ${formatTradeTimeTR(freshness.newestTradeTime)})`
        : null;
    const summaryOut = staleWarning
      ? `${staleWarning}\n\n${parsed?.summary ?? ""}`
      : parsed?.summary;

    return NextResponse.json({
      ok: true,
      reportOnly,
      dataStale: Boolean(staleWarning),
      generatedAt: new Date().toISOString(),
      pendingApprovals: pendingRows.length,
      decisions,
      summary: summaryOut,
      monthlyOutlook: parsed?.monthlyOutlook,
      // Structured rejim — urgent-check analysis.regime'i okuyup normalize eder
      // (ham geçer; normalize BELİRSİZ fallback'i yalnız model üretmezse devreye girer).
      // setup_type per-decision zaten akıyor; regime top-level, aynı passthrough mantığı.
      regime: parsed?.regime ?? null,
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
    // Chat guard'dan MUAF — bilerek sorulduğunda cevaplanır; ama bayat veriyle
    // çalışıldıysa yanıta uyarı eklenir
    const freshness = await getDataFreshness();
    const staleWarning =
      freshness.ok && freshness.allStale
        ? `⚠️ Veri bayat olabilir (son güncelleme: ${formatTradeTimeTR(freshness.newestTradeTime)})`
        : null;

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

    const rawReply = response.content[0].type === "text" ? response.content[0].text : "";

    // [ACTION] marker'ı varsa niyeti onay akışına bağla — chat yolu pozisyona
    // asla doğrudan dokunmaz, yalnızca PENDING + Telegram onay mesajı üretir
    const { cleanedReply, intent } = parseChatAction(rawReply);
    let reply = cleanedReply;
    let pendingDecision: { id: string; type: string; symbol: string } | null = null;

    if (intent) {
      const outcome = await createChatPendingDecision(intent, data, userMessage);
      pendingDecision = outcome.pendingDecision;
      if (outcome.note) reply = `${reply}\n\n${outcome.note}`;
    }

    if (staleWarning) reply = `${staleWarning}\n\n${reply}`;

    return NextResponse.json({
      ok: true,
      reply,
      dataStale: Boolean(staleWarning),
      pendingDecision,
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

// ---------------------------------------------------------------------------
// PENDING karar yardımcıları — runAgent (GET) ve chat (POST) ortak kullanır.
// İçerik, runAgent'taki eski inline bloktan bit-bit aynı davranışla taşındı.
// ---------------------------------------------------------------------------

async function insertPendingDecisions(rows: any[]): Promise<any[]> {
  if (rows.length === 0) return [];

  const { data: inserted, error: insertErr } = await supabase
    .from("ai_decisions")
    .insert(rows)
    .select("id,decision_type,symbol,reason,details,suggested_side,suggested_price,suggested_qty");

  if (insertErr) console.error("AI_DECISIONS_INSERT_ERROR", insertErr.message);
  return inserted ?? [];
}

async function notifyPendingDecision(dec: any): Promise<void> {
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
  } else if (dec.details?.origin === "CHAT_CONVERSATION") {
    lines.push("Kaynak: Chat isteği (kullanıcı talebi)");
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

// ---------------------------------------------------------------------------
// Chat aksiyon niyeti — [ACTION] marker protokolü
// Chat yolu pozisyona ASLA doğrudan dokunmaz (executeAiDecision/openPosition/
// closePosition çağrısı YOK): yalnızca PENDING kaydı + Telegram onay mesajı.
// ---------------------------------------------------------------------------

const CHAT_SYMBOL_RE = /^[A-Z0-9]{3,6}$/;

function parseChatAction(reply: string): { cleanedReply: string; intent: any | null } {
  const m = reply.match(/\n?\[ACTION\]\s*(\{[\s\S]*?\})\s*$/);
  if (!m) return { cleanedReply: reply, intent: null };

  const cleanedReply = reply.slice(0, m.index).trim();
  try {
    return { cleanedReply, intent: JSON.parse(m[1]) };
  } catch {
    console.warn("CHAT_ACTION_PARSE_FAIL", m[1].slice(0, 120));
    return { cleanedReply, intent: null };
  }
}

async function createChatPendingDecision(
  intent: any,
  data: any,
  userMessage: string
): Promise<{ pendingDecision: { id: string; type: string; symbol: string } | null; note: string | null }> {
  const type = String(intent?.type ?? "").toUpperCase();
  const symbol = String(intent?.symbol ?? "").trim().toUpperCase();
  const side = intent?.side ? String(intent.side).toUpperCase() : null;

  // Güvenlik: type whitelist + sembol format — uymuyorsa niyet YOK sayılır
  // (yanlış pozitife karşı temkinli: sessizce normal sohbete dönülür)
  if (!APPROVAL_TYPES.includes(type) || !CHAT_SYMBOL_RE.test(symbol)) {
    console.warn("CHAT_ACTION_REJECTED_FORMAT", JSON.stringify(intent).slice(0, 150));
    return { pendingDecision: null, note: null };
  }

  // 60 dk dedup — cron/manuel/chat tüm kaynaklar için ortak soğuma penceresi
  const sinceIso = new Date(Date.now() - 60 * 60_000).toISOString();
  const { data: dup } = await supabase
    .from("ai_decisions")
    .select("id")
    .eq("symbol", symbol)
    .eq("decision_type", type)
    .eq("status", "PENDING")
    .gte("created_at", sinceIso)
    .limit(1)
    .maybeSingle();

  if (dup) {
    return {
      pendingDecision: null,
      note: `⏳ ${symbol} için zaten bekleyen bir ${type} önerisi var (60 dk soğuma) — yeni onay isteği oluşturulmadı.`,
    };
  }

  const pos = data.positions.find((p: any) => p.symbol === symbol);

  let suggestedSide: string | null = null;
  let suggestedPrice: number | null = null;
  let suggestedQty: number | null = null;

  if (type === "RECOMMEND_OPEN") {
    if (side !== "LONG" && side !== "SHORT") {
      return {
        pendingDecision: null,
        note: `⚠️ ${symbol} için açılış isteğinde yön (LONG/SHORT) net değil — onay isteği oluşturulmadı. Yönü belirterek tekrar yazabilirsin.`,
      };
    }
    if (pos) {
      return {
        pendingDecision: null,
        note: `⚠️ ${symbol} için zaten açık pozisyon var — yeni açılış önerisi oluşturulmadı.`,
      };
    }
    const pool = data.opportunityPool.find((o: any) => o.symbol === symbol);
    const scan = data.marketScan.find((m: any) => m.symbol === symbol);
    suggestedSide = side;
    suggestedPrice = pool?.currentPrice ?? scan?.price ?? null;
    if (suggestedPrice) {
      try {
        suggestedQty = calculateSizing(suggestedPrice).quantity;
      } catch {
        suggestedQty = null;
      }
    }
  } else {
    // CLOSE / SWAP: açık pozisyon şart
    if (!pos) {
      return {
        pendingDecision: null,
        note: `❌ ${symbol} için açık pozisyon yok — ${type} önerisi oluşturulmadı.`,
      };
    }
    suggestedSide = pos.side;
    suggestedPrice = pos.currentPrice;
    suggestedQty = pos.remainingQuantity;
  }

  const row = {
    decision_type: type,
    symbol,
    reason: intent.reason
      ? String(intent.reason).slice(0, 200)
      : `Chat isteği: ${userMessage.slice(0, 140)}`,
    details: {
      detail: `Kullanıcı chat üzerinden talep etti: "${userMessage.slice(0, 300)}"`,
      urgency: "HIGH",
      source: null,
      origin: "CHAT_CONVERSATION",
    },
    portfolio_context: {
      realizedPnl: data.realizedPnl,
      totalPnl: data.totalPnl,
      monthProgress: data.monthInfo.monthProgress,
    },
    executed: false,
    status: "PENDING",
    suggested_side: suggestedSide,
    suggested_price: suggestedPrice ?? null,
    suggested_qty: suggestedQty ?? null,
  };

  const inserted = await insertPendingDecisions([row]);
  if (inserted.length === 0) {
    return { pendingDecision: null, note: "⚠️ Onay kaydı oluşturulamadı — sistem loguna bakılmalı." };
  }

  await notifyPendingDecision(inserted[0]);

  return {
    pendingDecision: { id: inserted[0].id, type, symbol },
    note: "📨 Bu öneri Telegram'a onay için gönderildi — sen onaylamadan uygulanmayacak.",
  };
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
