import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ACCOUNT_CAPITAL = Number(process.env.ACCOUNT_CAPITAL ?? 100_000);
const MAX_OPEN_POSITIONS = Number(process.env.MAX_OPEN_POSITIONS ?? 10);

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
  pnl_pct: number | null;
  opened_at: string;
  tp1_hit: boolean;
  trailing_stage: string | null;
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

interface SectorExposure {
  sector: string;
  allocatedAmount: number;
  pct: number;
  positionCount: number;
  symbols: string[];
  avgPnlPct: number;
}

interface CorrelationGroup {
  sector: string;
  symbols: string[];
  warning: string;
}

interface PositionSizeRecommendation {
  symbol: string;
  sector: string | null;
  currentAmount: number;
  targetAmount: number;
  diff: number;
  status: "OK" | "LARGE" | "SMALL";
  message: string;
}

interface MomentumScore {
  symbol: string;
  sector: string | null;
  score: number;          // 0–100
  signals: string[];      // açıklama listesi
  decision: "HOLD" | "WATCH" | "REDUCE" | "EXIT";
  daysOpen: number;
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const secret = req.nextUrl.searchParams.get("secret") ??
      req.headers.get("x-monitor-secret");

    const MONITOR_SECRET = process.env.RISK_MONITOR_SECRET ??
      process.env.TRADINGVIEW_WEBHOOK_SECRET ?? "ema100_secret_2026";

    if (secret !== MONITOR_SECRET) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Verileri çek
    const { data: positions, error: posErr } = await supabase
      .from("positions")
      .select("*")
      .eq("status", "OPEN");

    if (posErr) throw posErr;

    const { data: livePricesRaw, error: liveErr } = await supabase
      .from("live_prices")
      .select("symbol,last_price,rsi,ema20,ema50,ema100,atr,lrs,macd_div,macd_trigger,stoc_rsi,obv,aroon_up,aroon_down,elder_force_index");

    if (liveErr) throw liveErr;

    const openPositions: Position[] = positions ?? [];
    const liveMap = new Map<string, LivePrice>();
    (livePricesRaw ?? []).forEach((r: LivePrice) => liveMap.set(r.symbol, r));

    // ---------------------------------------------------------------------------
    // 1. SECTOR EXPOSURE
    // ---------------------------------------------------------------------------
    const sectorMap = new Map<string, {
      allocated: number;
      symbols: string[];
      pnlPcts: number[];
    }>();

    const totalAllocated = openPositions.reduce((s, p) => s + (p.allocated_amount ?? 0), 0);

    for (const pos of openPositions) {
      const sector = pos.sector ?? "DİĞER";
      const current = liveMap.get(pos.symbol)?.last_price ?? pos.current_price ?? pos.entry_price;
      const pnlPct = calcPnlPct(pos.side, pos.entry_price, current);

      if (!sectorMap.has(sector)) {
        sectorMap.set(sector, { allocated: 0, symbols: [], pnlPcts: [] });
      }
      const s = sectorMap.get(sector)!;
      s.allocated += pos.allocated_amount ?? 0;
      s.symbols.push(pos.symbol);
      s.pnlPcts.push(pnlPct);
    }

    const sectorExposure: SectorExposure[] = Array.from(sectorMap.entries())
      .map(([sector, data]) => ({
        sector,
        allocatedAmount: round2(data.allocated),
        pct: totalAllocated > 0 ? round2((data.allocated / ACCOUNT_CAPITAL) * 100) : 0,
        positionCount: data.symbols.length,
        symbols: data.symbols,
        avgPnlPct: round2(data.pnlPcts.reduce((a, b) => a + b, 0) / data.pnlPcts.length),
      }))
      .sort((a, b) => b.allocatedAmount - a.allocatedAmount);

    // ---------------------------------------------------------------------------
    // 2. CORRELATION GROUPS (aynı sektörde 2+ pozisyon)
    // ---------------------------------------------------------------------------
    const correlationGroups: CorrelationGroup[] = sectorExposure
      .filter(s => s.positionCount >= 2)
      .map(s => ({
        sector: s.sector,
        symbols: s.symbols,
        warning: `${s.symbols.join(", ")} aynı sektörde (${s.sector}). Portföy %${s.pct} bu sektöre yoğunlaşmış.`,
      }));

    // ---------------------------------------------------------------------------
    // 3. PORTFOLIO RISK SCORE (0–100)
    // ---------------------------------------------------------------------------
    let riskScore = 0;

    // Sektör yoğunlaşması (max 35 puan)
    const maxSectorPct = sectorExposure.length > 0
      ? Math.max(...sectorExposure.map(s => s.pct))
      : 0;
    if (maxSectorPct > 40) riskScore += 35;
    else if (maxSectorPct > 30) riskScore += 25;
    else if (maxSectorPct > 20) riskScore += 15;
    else riskScore += 5;

    // Pozisyon doluluk oranı (max 20 puan)
    const fillRatio = openPositions.length / MAX_OPEN_POSITIONS;
    riskScore += Math.round(fillRatio * 20);

    // Ortalama PnL (max 20 puan)
    const avgPnl = openPositions.length > 0
      ? openPositions.reduce((s, p) => {
          const current = liveMap.get(p.symbol)?.last_price ?? p.current_price ?? p.entry_price;
          return s + calcPnlPct(p.side, p.entry_price, current);
        }, 0) / openPositions.length
      : 0;
    if (avgPnl < -3) riskScore += 20;
    else if (avgPnl < 0) riskScore += 12;
    else if (avgPnl < 2) riskScore += 5;

    // Korelasyon grupları (max 15 puan)
    riskScore += Math.min(correlationGroups.length * 5, 15);

    // Exposure oranı (max 10 puan)
    const exposurePct = (totalAllocated / ACCOUNT_CAPITAL) * 100;
    if (exposurePct > 80) riskScore += 10;
    else if (exposurePct > 60) riskScore += 6;
    else riskScore += 2;

    riskScore = Math.min(100, riskScore);

    // ---------------------------------------------------------------------------
    // 4. CASH ALLOCATION
    // ---------------------------------------------------------------------------
    const cashAllocation = {
      totalCapital: ACCOUNT_CAPITAL,
      usedAmount: round2(totalAllocated),
      freeAmount: round2(ACCOUNT_CAPITAL - totalAllocated),
      exposurePct: round2(exposurePct),
      openPositions: openPositions.length,
      maxPositions: MAX_OPEN_POSITIONS,
      availableSlots: MAX_OPEN_POSITIONS - openPositions.length,
    };

    // ---------------------------------------------------------------------------
    // 5. POSITION SIZE RECOMMENDATIONS
    // ---------------------------------------------------------------------------
    const targetAmount = ACCOUNT_CAPITAL / MAX_OPEN_POSITIONS;

    const positionSizeRecommendations: PositionSizeRecommendation[] = openPositions.map(pos => {
      const current = pos.allocated_amount ?? 0;
      const diff = round2(current - targetAmount);
      let status: "OK" | "LARGE" | "SMALL" = "OK";
      let message = "Pozisyon boyutu hedef ile uyumlu.";

      if (current > targetAmount * 1.25) {
        status = "LARGE";
        message = `Hedefin %${round2(((current - targetAmount) / targetAmount) * 100)} üstünde. Azaltmayı değerlendirin.`;
      } else if (current < targetAmount * 0.75) {
        status = "SMALL";
        message = `Hedefin %${round2(((targetAmount - current) / targetAmount) * 100)} altında. Küçük pozisyon.`;
      }

      return {
        symbol: pos.symbol,
        sector: pos.sector,
        currentAmount: round2(current),
        targetAmount: round2(targetAmount),
        diff,
        status,
        message,
      };
    });

    // ---------------------------------------------------------------------------
    // 6. MOMENTUM SCORES (5 katman)
    // ---------------------------------------------------------------------------
    const momentumScores: MomentumScore[] = openPositions.map(pos => {
      const live = liveMap.get(pos.symbol);
      const current = live?.last_price ?? pos.current_price ?? pos.entry_price;
      const daysOpen = Math.floor(
        (Date.now() - new Date(pos.opened_at).getTime()) / (1000 * 60 * 60 * 24)
      );

      let score = 100;
      const signals: string[] = [];

      // KATMAN 1: Trend kalitesi (30 puan)
      if (live?.ema20 && live?.ema50 && live?.ema100) {
        const trendAligned = pos.side === "LONG"
          ? live.ema20 > live.ema50 && live.ema50 > live.ema100
          : live.ema20 < live.ema50 && live.ema50 < live.ema100;
        if (!trendAligned) { score -= 15; signals.push("EMA yapısı bozulmuş"); }

        const aboveEma100 = pos.side === "LONG"
          ? current > live.ema100
          : current < live.ema100;
        if (!aboveEma100) { score -= 15; signals.push("Fiyat EMA100 altında"); }
      } else if (live?.ema100) {
        const aboveEma100 = pos.side === "LONG" ? current > live.ema100 : current < live.ema100;
        if (!aboveEma100) { score -= 20; signals.push("Fiyat EMA100 altında"); }
      }

      // LRS slope
      if (live?.lrs !== null && live?.lrs !== undefined) {
        const weakSlope = pos.side === "LONG" ? live.lrs < -0.1 : live.lrs > 0.1;
        if (weakSlope) { score -= 10; signals.push("Trend eğimi zayıflıyor (LRS)"); }
      }

      // KATMAN 2: Momentum göstergeleri (20 puan)
      if (live?.rsi !== null && live?.rsi !== undefined) {
        if (pos.side === "LONG" && live.rsi < 35) { score -= 10; signals.push(`RSI zayıf (${round2(live.rsi)})`); }
        if (pos.side === "SHORT" && live.rsi > 65) { score -= 10; signals.push(`RSI aşırı alım (${round2(live.rsi)})`); }
      }

      if (live?.macd_div !== null && live?.macd_div !== undefined) {
        const weakMacd = pos.side === "LONG" ? live.macd_div < 0 : live.macd_div > 0;
        if (weakMacd) { score -= 10; signals.push("MACD negatif bölgede"); }
      }

      // Stokastik RSI
      if (live?.stoc_rsi !== null && live?.stoc_rsi !== undefined) {
        if (pos.side === "LONG" && live.stoc_rsi < 20) { score -= 5; signals.push("StocRSI aşırı satım"); }
        if (pos.side === "LONG" && live.stoc_rsi > 80) { score -= 5; signals.push("StocRSI aşırı alım — dönüş riski"); }
      }

      // Aroon
      if (live?.aroon_up !== null && live?.aroon_down !== null &&
          live?.aroon_up !== undefined && live?.aroon_down !== undefined) {
        if (pos.side === "LONG" && live.aroon_down > live.aroon_up) {
          score -= 10; signals.push(`Aroon: Düşüş baskısı (↑${round2(live.aroon_up)} ↓${round2(live.aroon_down)})`);
        }
        if (pos.side === "SHORT" && live.aroon_up > live.aroon_down) {
          score -= 10; signals.push(`Aroon: Yükseliş baskısı (↑${round2(live.aroon_up)} ↓${round2(live.aroon_down)})`);
        }
      }

      // KATMAN 3: Hacim analizi (15 puan)
      if (live?.elder_force_index !== null && live?.elder_force_index !== undefined) {
        const weakForce = pos.side === "LONG"
          ? live.elder_force_index < 0
          : live.elder_force_index > 0;
        if (weakForce) { score -= 10; signals.push("Elder Force Index: Güç kaybı"); }
      }

      if (live?.obv !== null && live?.obv !== undefined && live.obv === 0) {
        score -= 5; signals.push("OBV: Hacim desteği yok");
      }

      // KATMAN 4: Zaman (15 puan)
      if (daysOpen > 21) {
        const extra = Math.min(Math.floor((daysOpen - 21) / 7) * 3, 15);
        score -= extra;
        signals.push(`${daysOpen} gündür açık (eşik: 21 gün)`);
      }

      // ATR — stop yakınlığı (10 puan)
      if (live?.atr && live.atr > 0) {
        const entry = pos.entry_price;
        const stopPct = Math.abs((current - entry) / entry) * 100;
        if (stopPct > 8) { score -= 10; signals.push("Stop seviyesine yakın"); }
      }

      score = Math.max(0, Math.min(100, score));

      let decision: MomentumScore["decision"] = "HOLD";
      if (score < 35) decision = "EXIT";
      else if (score < 50) decision = "REDUCE";
      else if (score < 65) decision = "WATCH";

      return {
        symbol: pos.symbol,
        sector: pos.sector,
        score,
        signals,
        decision,
        daysOpen,
      };
    }).sort((a, b) => a.score - b.score);

    // ---------------------------------------------------------------------------
    // 7. HEAT MAP verisi
    // ---------------------------------------------------------------------------
    const heatMap = openPositions.map(pos => {
      const current = liveMap.get(pos.symbol)?.last_price ?? pos.current_price ?? pos.entry_price;
      const pnlPct = calcPnlPct(pos.side, pos.entry_price, current);
      const momentum = momentumScores.find(m => m.symbol === pos.symbol);

      return {
        symbol: pos.symbol,
        sector: pos.sector ?? "DİĞER",
        side: pos.side,
        allocatedAmount: round2(pos.allocated_amount ?? 0),
        pnlPct: round2(pnlPct),
        momentumScore: momentum?.score ?? 50,
        decision: momentum?.decision ?? "HOLD",
        daysOpen: momentum?.daysOpen ?? 0,
      };
    });

    // ---------------------------------------------------------------------------
    // YANIT
    // ---------------------------------------------------------------------------
    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      summary: {
        openPositions: openPositions.length,
        totalAllocated: round2(totalAllocated),
        totalCapital: ACCOUNT_CAPITAL,
        exposurePct: round2(exposurePct),
        riskScore,
        riskLevel: riskScore >= 70 ? "HIGH" : riskScore >= 45 ? "MEDIUM" : "LOW",
        correlationWarnings: correlationGroups.length,
        exitCandidates: momentumScores.filter(m => m.decision === "EXIT").length,
        reduceCandidates: momentumScores.filter(m => m.decision === "REDUCE").length,
      },
      sectorExposure,
      correlationGroups,
      cashAllocation,
      positionSizeRecommendations,
      momentumScores,
      heatMap,
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("PORTFOLIO_ANALYTICS_ERROR", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
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
