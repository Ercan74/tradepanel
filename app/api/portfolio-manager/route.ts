import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ACCOUNT_CAPITAL = Number(process.env.ACCOUNT_CAPITAL ?? 100_000);
const MAX_OPEN_POSITIONS = Number(process.env.MAX_OPEN_POSITIONS ?? 10);
const STOP_LOSS_PCT = Number(process.env.STOP_LOSS_PCT ?? 3);
const TP1_PCT = Number(process.env.TP1_PCT ?? 6);
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const MIN_QUALITY_SCORE = Number(process.env.MIN_QUALITY_SCORE ?? 75);

const MONITOR_SECRET =
  process.env.RISK_MONITOR_SECRET ??
  process.env.TRADINGVIEW_WEBHOOK_SECRET ??
  "ema100_secret_2026";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// Tip tanımları
// ---------------------------------------------------------------------------

interface Position {
  id: string;
  symbol: string;
  side: string;
  sector: string | null;
  status: string;
  entry_price: number;
  current_price: number | null;
  allocated_amount: number;
  remaining_quantity: number;
  quantity: number;
  pnl_amount: number | null;
  opened_at: string;
  tp1_hit: boolean;
  trailing_stage: string | null;
  stop_price: number | null;
}

interface LivePrice {
  symbol: string;
  last_price: number;
  rsi: number | null;
  ema20: number | null;
  ema50: number | null;
  ema100: number | null;
  atr: number | null;
  lrs: number | null;
  macd_div: number | null;
  macd_trigger: number | null;
  stoc_rsi: number | null;
  obv: number | null;
  aroon_up: number | null;
  aroon_down: number | null;
  elder_force_index: number | null;
}

interface Signal {
  id: string;
  symbol: string;
  side: string;
  price: number;
  quality_score: number;
  quality_band: string | null;
  strategy_tag: string | null;
  timeframe: string | null;
  decision: string;
  created_at: string;
}

interface ManagerDecision {
  type: "CLOSE" | "SWAP" | "OPEN_PENDING" | "WATCH";
  symbol: string;
  reason: string;
  details: string[];
  score?: number;
  daysOpen?: number;
  pnlPct?: number;
  candidate?: Signal | null;
}

// ---------------------------------------------------------------------------
// GET / POST handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  return runManager(req);
}

export async function POST(req: NextRequest) {
  return runManager(req);
}

async function runManager(req: NextRequest) {
  try {
    const secret =
      req.nextUrl.searchParams.get("secret") ??
      req.headers.get("x-monitor-secret");

    if (secret !== MONITOR_SECRET) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // ------------------------------------------------------------------
    // 1. Verileri çek
    // ------------------------------------------------------------------
    const { data: positions, error: posErr } = await supabase
      .from("positions")
      .select("*")
      .eq("status", "OPEN")
      .order("opened_at", { ascending: true });

    if (posErr) throw posErr;

    const { data: livePricesRaw, error: liveErr } = await supabase
      .from("live_prices")
      .select("symbol,last_price,rsi,ema20,ema50,ema100,atr,lrs,macd_div,macd_trigger,stoc_rsi,obv,aroon_up,aroon_down,elder_force_index,adx,stoch_fast_k,stoch_fast_d,rsi_4h,ema100_4h,ema20_4h,ema50_4h,atr_4h,adx_4h,stoch_fast_k_4h,stoch_fast_d_4h");

    if (liveErr) throw liveErr;

    // Reddedilmiş veya bekleyen yüksek kaliteli sinyaller
    const { data: pendingSignals, error: sigErr } = await supabase
      .from("signals")
      .select("*")
      .in("decision", ["REJECTED_MAX_OPEN_POSITIONS_REACHED", "RECEIVED", "PENDING"])
      .gte("quality_score", MIN_QUALITY_SCORE)
      .order("quality_score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20);

    if (sigErr) throw sigErr;

    const openPositions: Position[] = positions ?? [];
    const liveMap = new Map<string, LivePrice>();
    (livePricesRaw ?? []).forEach((r: LivePrice) => liveMap.set(r.symbol, r));
    const signals: Signal[] = pendingSignals ?? [];

    // ------------------------------------------------------------------
    // 2. Her pozisyon için momentum skoru hesapla
    // ------------------------------------------------------------------
    const scoredPositions = openPositions.map(pos => {
      const live = liveMap.get(pos.symbol);
      const current = live?.last_price ?? pos.current_price ?? pos.entry_price;
      const daysOpen = Math.floor(
        (Date.now() - new Date(pos.opened_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      const pnlPct = calcPnlPct(pos.side, pos.entry_price, current);

      let score = 100;
      const signals: string[] = [];

      // KATMAN 1: Trend (30 puan)
      if (live?.ema20 && live?.ema50 && live?.ema100) {
        const aligned = pos.side === "LONG"
          ? live.ema20 > live.ema50 && live.ema50 > live.ema100
          : live.ema20 < live.ema50 && live.ema50 < live.ema100;
        if (!aligned) { score -= 15; signals.push("EMA yapısı bozulmuş (20/50/100)"); }
        const aboveEma100 = pos.side === "LONG" ? current > live.ema100 : current < live.ema100;
        if (!aboveEma100) { score -= 15; signals.push("Fiyat EMA100 altında"); }
      } else if (live?.ema100) {
        const above = pos.side === "LONG" ? current > live.ema100 : current < live.ema100;
        if (!above) { score -= 20; signals.push("Fiyat EMA100 altında"); }
      }

      if (live?.lrs !== null && live?.lrs !== undefined) {
        const weak = pos.side === "LONG" ? live.lrs < -0.1 : live.lrs > 0.1;
        if (weak) { score -= 10; signals.push(`Trend eğimi zayıflıyor (LRS: ${round2(live.lrs)})`); }
      }

      // KATMAN 2: Momentum (20 puan)
      if (live?.rsi !== null && live?.rsi !== undefined) {
        if (pos.side === "LONG" && live.rsi < 35) { score -= 10; signals.push(`RSI zayıf (${round2(live.rsi)})`); }
        if (pos.side === "SHORT" && live.rsi > 65) { score -= 10; signals.push(`RSI aşırı alım (${round2(live.rsi)})`); }
      }

      if (live?.macd_div !== null && live?.macd_div !== undefined) {
        const weak = pos.side === "LONG" ? live.macd_div < 0 : live.macd_div > 0;
        if (weak) { score -= 10; signals.push("MACD negatif bölgede"); }
      }

      if (live?.stoc_rsi !== null && live?.stoc_rsi !== undefined) {
        if (pos.side === "LONG" && live.stoc_rsi > 80) { score -= 5; signals.push("StocRSI aşırı alım — dönüş riski"); }
        if (pos.side === "LONG" && live.stoc_rsi < 20) { score -= 5; signals.push("StocRSI aşırı satım"); }
      }

      // KATMAN 3: Aroon (10 puan)
      if (live?.aroon_up !== null && live?.aroon_down !== null &&
          live?.aroon_up !== undefined && live?.aroon_down !== undefined) {
        if (pos.side === "LONG" && live.aroon_down > live.aroon_up) {
          score -= 10;
          signals.push(`Aroon: Düşüş baskısı (↑${round2(live.aroon_up)} ↓${round2(live.aroon_down)})`);
        }
        if (pos.side === "SHORT" && live.aroon_up > live.aroon_down) {
          score -= 10;
          signals.push(`Aroon: Yükseliş baskısı`);
        }
      }

      // KATMAN 4: Hacim (15 puan)
      if (live?.elder_force_index !== null && live?.elder_force_index !== undefined) {
        const weak = pos.side === "LONG" ? live.elder_force_index < 0 : live.elder_force_index > 0;
        if (weak) { score -= 10; signals.push("Elder Force Index: Güç kaybı"); }
      }

      // KATMAN 5: Zaman (15 puan)
      if (daysOpen > 21) {
        const penalty = Math.min(Math.floor((daysOpen - 21) / 7) * 5, 15);
        score -= penalty;
        signals.push(`${daysOpen} gündür açık (eşik: 21 gün)`);
      }

      // ATR stop yakınlığı (10 puan)
      if (live?.atr && live.atr > 0) {
        const distPct = Math.abs((current - pos.entry_price) / pos.entry_price) * 100;
        if (distPct > 8) { score -= 10; signals.push("Stop seviyesine yakın"); }
      }

      score = Math.max(0, Math.min(100, score));

      let decision: "HOLD" | "WATCH" | "REDUCE" | "EXIT" = "HOLD";
      if (score < 35) decision = "EXIT";
      else if (score < 50) decision = "REDUCE";
      else if (score < 65) decision = "WATCH";

      return { pos, live, current, daysOpen, pnlPct, score, signals, decision };
    });

    // ------------------------------------------------------------------
    // 3. Bekleyen sinyalleri doğrula — hâlâ geçerli mi?
    // ------------------------------------------------------------------
    const validCandidates = signals.filter(sig => {
      const live = liveMap.get(sig.symbol);
      if (!live?.last_price) return false;

      // Sinyal fiyatından max %5 uzaklaşmamış olmalı
      const priceDrift = Math.abs((live.last_price - sig.price) / sig.price) * 100;
      if (priceDrift > 5) return false;

      // RSI 30-70 arası olmalı (ne aşırı alım ne satım)
      if (live.rsi !== null && live.rsi !== undefined) {
        if (live.rsi < 30 || live.rsi > 70) return false;
      }

      // Fiyat EMA100 üzerinde olmalı (LONG için)
      if (sig.side === "LONG" && live.ema100 && live.last_price < live.ema100) return false;
      if (sig.side === "SHORT" && live.ema100 && live.last_price > live.ema100) return false;

      // Zaten açık pozisyon var mı?
      const alreadyOpen = openPositions.some(p => p.symbol === sig.symbol);
      if (alreadyOpen) return false;

      return true;
    });

    // ------------------------------------------------------------------
    // 4. Karar matrisi
    // ------------------------------------------------------------------
    const decisions: ManagerDecision[] = [];

    for (const scored of scoredPositions) {
      const { pos, pnlPct, score, signals: sigs, decision, daysOpen } = scored;

      if (decision === "EXIT") {
        // En iyi geçerli aday var mı?
        const candidate = validCandidates[0] ?? null;

        decisions.push({
          type: candidate ? "SWAP" : "CLOSE",
          symbol: pos.symbol,
          reason: decision === "EXIT" ? "Momentum skoru kritik seviyede" : "Zayıf momentum",
          details: sigs,
          score,
          daysOpen,
          pnlPct: round2(pnlPct),
          candidate,
        });

      } else if (decision === "REDUCE") {
        decisions.push({
          type: "WATCH",
          symbol: pos.symbol,
          reason: "Momentum zayıflıyor — izlemeye alındı",
          details: sigs,
          score,
          daysOpen,
          pnlPct: round2(pnlPct),
          candidate: null,
        });
      }
    }

    // Boş slot varsa ve geçerli aday varsa öner
    const availableSlots = MAX_OPEN_POSITIONS - openPositions.length;
    if (availableSlots > 0 && validCandidates.length > 0) {
      const alreadySwapTarget = decisions
        .filter(d => d.candidate)
        .map(d => d.candidate?.symbol);

      for (const cand of validCandidates.slice(0, availableSlots)) {
        if (!alreadySwapTarget.includes(cand.symbol)) {
          decisions.push({
            type: "OPEN_PENDING",
            symbol: cand.symbol,
            reason: `Boş slot mevcut — yüksek kaliteli sinyal bekliyor (Skor: ${cand.quality_score})`,
            details: [
              `Sinyal tarihi: ${formatDate(cand.created_at)}`,
              `Yön: ${cand.side}`,
              `Sinyal fiyatı: ${formatPrice(cand.price)}`,
              `Güncel fiyat: ${formatPrice(liveMap.get(cand.symbol)?.last_price ?? 0)}`,
            ],
            candidate: cand,
          });
        }
      }
    }

    // ------------------------------------------------------------------
    // 5. Telegram bildirimi — sadece aksiyon gerektiren kararlar
    // ------------------------------------------------------------------
    const actionDecisions = decisions.filter(d => d.type !== "WATCH");

    if (actionDecisions.length > 0) {
      await sendTelegramDecisions(actionDecisions, scoredPositions);
    } else if (decisions.some(d => d.type === "WATCH")) {
      // Watch kararları varsa özet gönder
      await sendTelegramWatchSummary(decisions.filter(d => d.type === "WATCH"));
    }

    // ------------------------------------------------------------------
    // YANIT
    // ------------------------------------------------------------------
    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      summary: {
        openPositions: openPositions.length,
        availableSlots,
        validCandidates: validCandidates.length,
        decisions: decisions.length,
        actionRequired: actionDecisions.length,
      },
      decisions,
      momentumScores: scoredPositions.map(s => ({
        symbol: s.pos.symbol,
        score: s.score,
        decision: s.decision,
        daysOpen: s.daysOpen,
        pnlPct: round2(s.pnlPct),
        signals: s.signals,
      })),
      validCandidates: validCandidates.map(c => ({
        symbol: c.symbol,
        side: c.side,
        quality_score: c.quality_score,
        price: c.price,
        created_at: c.created_at,
      })),
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("PORTFOLIO_MANAGER_ERROR", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Telegram — aksiyon gerektiren kararlar
// ---------------------------------------------------------------------------

async function sendTelegramDecisions(
  decisions: ManagerDecision[],
  scored: any[]
) {
  const lines: string[] = [];
  lines.push("🤖 PORTFÖY YÖNETİCİSİ KARARI");
  lines.push(`📅 ${new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}`);
  lines.push("");

  for (const d of decisions) {
    if (d.type === "SWAP") {
      lines.push(`🔄 TAKAS ÖNERİSİ`);
      lines.push(`━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`📤 KAPAT: ${d.symbol}`);
      lines.push(`   Sebep: ${d.reason}`);
      lines.push(`   Momentum: ${d.score}/100`);
      lines.push(`   ${d.daysOpen} gündür açık`);
      lines.push(`   PnL: ${formatPct(d.pnlPct ?? 0)}`);
      if (d.details.length > 0) {
        lines.push(`   Sinyaller:`);
        d.details.forEach(s => lines.push(`   • ${s}`));
      }
      if (d.candidate) {
        lines.push("");
        lines.push(`📥 AÇ: ${d.candidate.symbol}`);
        lines.push(`   Yön: ${d.candidate.side}`);
        lines.push(`   Skor: ${d.candidate.quality_score}`);
        lines.push(`   Sinyal fiyatı: ${formatPrice(d.candidate.price)}`);
        lines.push(`   Tarih: ${formatDate(d.candidate.created_at)}`);
      }
      lines.push("");

    } else if (d.type === "CLOSE") {
      lines.push(`🚪 KAPAT ÖNERİSİ`);
      lines.push(`━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`Sembol: ${d.symbol}`);
      lines.push(`Sebep: ${d.reason}`);
      lines.push(`Momentum: ${d.score}/100`);
      lines.push(`${d.daysOpen} gündür açık`);
      lines.push(`PnL: ${formatPct(d.pnlPct ?? 0)}`);
      if (d.details.length > 0) {
        lines.push(`Sinyaller:`);
        d.details.forEach(s => lines.push(`• ${s}`));
      }
      lines.push("");

    } else if (d.type === "OPEN_PENDING") {
      lines.push(`🟢 YENİ SİNYAL`);
      lines.push(`━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`Sembol: ${d.symbol}`);
      lines.push(`Sebep: ${d.reason}`);
      if (d.details.length > 0) {
        d.details.forEach(s => lines.push(`• ${s}`));
      }
      lines.push("");
    }
  }

  lines.push("⚠️ ONAY BEKLİYOR");
  lines.push("Manuel işlem gerekiyor.");

  await sendTelegram(lines.join("\n"));
}

// ---------------------------------------------------------------------------
// Telegram — sadece izleme kararları
// ---------------------------------------------------------------------------

async function sendTelegramWatchSummary(decisions: ManagerDecision[]) {
  const lines: string[] = [];
  lines.push("👁 PORTFÖY İZLEME RAPORU");
  lines.push(`📅 ${new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}`);
  lines.push("");
  lines.push("Acil aksiyon gerektiren durum yok.");
  lines.push("İzlemeye alınan pozisyonlar:");
  lines.push("");

  for (const d of decisions) {
    lines.push(`• ${d.symbol} — Skor: ${d.score}/100 | ${d.daysOpen} gün | PnL: ${formatPct(d.pnlPct ?? 0)}`);
    if (d.details.length > 0) {
      lines.push(`  ${d.details[0]}`);
    }
  }

  await sendTelegram(lines.join("\n"));
}

// ---------------------------------------------------------------------------
// Telegram gönderici
// ---------------------------------------------------------------------------

async function sendTelegram(text: string) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("Telegram env eksik");
    return;
  }

  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        disable_web_page_preview: true,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("Telegram send failed", err);
  }
}

// ---------------------------------------------------------------------------
// Yardımcı fonksiyonlar
// ---------------------------------------------------------------------------

function calcPnlPct(side: string, entry: number, current: number): number {
  if (!entry || !current) return 0;
  return side === "LONG"
    ? ((current - entry) / entry) * 100
    : ((entry - current) / entry) * 100;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatPrice(value: number): string {
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPct(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}%${round2(value)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
