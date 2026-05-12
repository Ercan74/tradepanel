import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const SL_PCT = 0.02;
const TP1_PCT = 0.03;
const TP2_PCT = 0.05;

const ACCOUNT_SIZE = 100000;
const MAX_OPEN_POSITIONS = 5;
const MAX_SINGLE_EXPOSURE_PCT = 25;
const MAX_TOTAL_EXPOSURE_PCT = 100;
const MIN_QUALITY_SCORE = 70;
const COOLDOWN_MINUTES = 30;

function normalizeSide(rawSide: string) {
  const value = rawSide.toUpperCase();

  if (value === "BUY" || value === "LONG") return "LONG";
  if (value === "SELL" || value === "SHORT") return "SHORT";

  return value;
}

function roundPrice(value: number) {
  return Number(value.toFixed(4));
}

function calcPnl(side: string, entry: number, current: number) {
  const pnl = side === "LONG" ? current - entry : entry - current;
  const pnlPct = entry ? (pnl / entry) * 100 : 0;

  return {
    pnl: roundPrice(pnl),
    pnl_pct: roundPrice(pnlPct),
  };
}

function calcRiskLevels(side: string, entry: number) {
  const slPrice =
    side === "LONG"
      ? entry * (1 - SL_PCT)
      : entry * (1 + SL_PCT);

  const tp1Price =
    side === "LONG"
      ? entry * (1 + TP1_PCT)
      : entry * (1 - TP1_PCT);

  const tp2Price =
    side === "LONG"
      ? entry * (1 + TP2_PCT)
      : entry * (1 - TP2_PCT);

  return {
    sl_price: roundPrice(slPrice),
    tp1_price: roundPrice(tp1Price),
    tp2_price: roundPrice(tp2Price),
    trailing_price: roundPrice(slPrice),
    risk_pct: SL_PCT * 100,
  };
}

function qualityBand(score: number) {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B+";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

function fallbackQualityScore(body: any) {
  const signal = String(body.signal || "");
  const state = String(body.state || "");
  const rsi = Number(body.rsi || 50);
  const distATR = Math.abs(Number(body.distATR || 0));
  const slope = Math.abs(Number(body.slopePct || 0));
  const hist = Math.abs(Number(body.hist || 0));

  let score = 50;

  if (signal === "CONFIRMED_EXECUTION") score += 25;
  if (state.includes("READY")) score += 10;
  if (state.includes("EXTREME")) score += 6;

  score += Math.min(distATR, 4) * 2;
  score += Math.min(Math.abs(rsi - 50) / 5, 5);
  score += Math.min(slope * 5, 8);
  score += Math.min(hist * 5, 5);

  return Math.max(0, Math.min(100, roundPrice(score)));
}

async function rejectSignal(params: {
  symbol: string;
  side: string;
  price: number;
  reason: string;
  body: any;
  qualityScore?: number;
  qualityBandValue?: string;
  quantity?: number;
  notional?: number;
  exposurePct?: number;
}) {
  await supabase.from("signals").insert([
    {
      symbol: params.symbol,
      side: params.side,
      price: params.price,
      entry_price: params.price,
      current_price: params.price,
      pnl: 0,
      pnl_pct: 0,
      quantity: params.quantity ?? null,
      notional: params.notional ?? null,
      exposure_pct: params.exposurePct ?? null,
      quality_score: params.qualityScore ?? null,
      quality_band: params.qualityBandValue ?? null,
      strategy_tag: params.body.strategyTag ?? null,
      timeframe: params.body.timeframe ?? null,
      signal_raw: params.body,
      status: "REJECTED",
      reject_reason: params.reason,
      rejected_at: new Date().toISOString(),
    },
  ]);
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "TradingView webhook endpoint is alive",
    engine: {
      maxOpenPositions: MAX_OPEN_POSITIONS,
      maxSingleExposurePct: MAX_SINGLE_EXPOSURE_PCT,
      maxTotalExposurePct: MAX_TOTAL_EXPOSURE_PCT,
      minQualityScore: MIN_QUALITY_SCORE,
      cooldownMinutes: COOLDOWN_MINUTES,
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const rawSide = body.order_action || body.orderSide || body.side || "";
    const side = normalizeSide(String(rawSide));

    const symbol = body.symbol || body.ticker || "UNKNOWN";
    const price = Number(body.price || body.close || 0);

    if (!symbol || symbol === "UNKNOWN" || !side || !price) {
      return NextResponse.json(
        {
          success: false,
          action: "REJECTED",
          reason: "MISSING_SYMBOL_SIDE_OR_PRICE",
          received: body,
        },
        { status: 400 }
      );
    }

    const quantity = Number(body.quantity || 1);
    const notional = roundPrice(quantity * price);
    const exposurePct = roundPrice((notional / ACCOUNT_SIZE) * 100);

    const qualityScore = Number(
      body.quality_score ??
        body.qualityScore ??
        body.q ??
        fallbackQualityScore(body)
    );

    const qualityBandValue =
      body.quality_band ||
      body.qualityBand ||
      qualityBand(qualityScore);

    const { data: openPositions, error: openError } = await supabase
      .from("signals")
      .select("*")
      .eq("status", "OPEN");

    if (openError) {
      return NextResponse.json(
        {
          success: false,
          error: openError.message,
        },
        { status: 500 }
      );
    }

    const allOpen = openPositions || [];
    const currentOpen = allOpen.find((p) => p.symbol === symbol);

    if (currentOpen && currentOpen.side === side) {
      await rejectSignal({
        symbol,
        side,
        price,
        reason: "DUPLICATE_POSITION",
        body,
        qualityScore,
        qualityBandValue,
        quantity,
        notional,
        exposurePct,
      });

      return NextResponse.json({
        success: false,
        action: "REJECTED",
        reason: "DUPLICATE_POSITION",
        existing: currentOpen,
      });
    }

    const isReversal = Boolean(currentOpen && currentOpen.side !== side);

    if (!isReversal && allOpen.length >= MAX_OPEN_POSITIONS) {
      await rejectSignal({
        symbol,
        side,
        price,
        reason: "MAX_OPEN_POSITIONS_REACHED",
        body,
        qualityScore,
        qualityBandValue,
        quantity,
        notional,
        exposurePct,
      });

      return NextResponse.json({
        success: false,
        action: "REJECTED",
        reason: "MAX_OPEN_POSITIONS_REACHED",
        openCount: allOpen.length,
        maxOpenPositions: MAX_OPEN_POSITIONS,
      });
    }

    if (qualityScore < MIN_QUALITY_SCORE) {
      await rejectSignal({
        symbol,
        side,
        price,
        reason: "LOW_QUALITY_SCORE",
        body,
        qualityScore,
        qualityBandValue,
        quantity,
        notional,
        exposurePct,
      });

      return NextResponse.json({
        success: false,
        action: "REJECTED",
        reason: "LOW_QUALITY_SCORE",
        qualityScore,
        minQualityScore: MIN_QUALITY_SCORE,
      });
    }

    const cooldownDate = new Date(
      Date.now() - COOLDOWN_MINUTES * 60 * 1000
    ).toISOString();

    const { data: recentClosed, error: cooldownError } = await supabase
      .from("signals")
      .select("*")
      .eq("symbol", symbol)
      .in("close_reason", ["SL_HIT", "TRAILING_STOP_HIT"])
      .gte("closed_at", cooldownDate)
      .order("closed_at", { ascending: false })
      .limit(1);

    if (cooldownError) {
      return NextResponse.json(
        {
          success: false,
          error: cooldownError.message,
        },
        { status: 500 }
      );
    }

    if (!isReversal && recentClosed && recentClosed.length > 0) {
      await rejectSignal({
        symbol,
        side,
        price,
        reason: "COOLDOWN_ACTIVE",
        body,
        qualityScore,
        qualityBandValue,
        quantity,
        notional,
        exposurePct,
      });

      return NextResponse.json({
        success: false,
        action: "REJECTED",
        reason: "COOLDOWN_ACTIVE",
        cooldownMinutes: COOLDOWN_MINUTES,
        recentClosed: recentClosed[0],
      });
    }

    if (exposurePct > MAX_SINGLE_EXPOSURE_PCT) {
      await rejectSignal({
        symbol,
        side,
        price,
        reason: "MAX_SINGLE_EXPOSURE_EXCEEDED",
        body,
        qualityScore,
        qualityBandValue,
        quantity,
        notional,
        exposurePct,
      });

      return NextResponse.json({
        success: false,
        action: "REJECTED",
        reason: "MAX_SINGLE_EXPOSURE_EXCEEDED",
        exposurePct,
        maxSingleExposurePct: MAX_SINGLE_EXPOSURE_PCT,
      });
    }

    const currentTotalExposure = allOpen.reduce((sum, p) => {
      return sum + Number(p.exposure_pct || 0);
    }, 0);

    const projectedTotalExposure = isReversal
      ? roundPrice(
          currentTotalExposure -
            Number(currentOpen?.exposure_pct || 0) +
            exposurePct
        )
      : roundPrice(currentTotalExposure + exposurePct);

    if (projectedTotalExposure > MAX_TOTAL_EXPOSURE_PCT) {
      await rejectSignal({
        symbol,
        side,
        price,
        reason: "MAX_TOTAL_EXPOSURE_EXCEEDED",
        body,
        qualityScore,
        qualityBandValue,
        quantity,
        notional,
        exposurePct,
      });

      return NextResponse.json({
        success: false,
        action: "REJECTED",
        reason: "MAX_TOTAL_EXPOSURE_EXCEEDED",
        projectedTotalExposure,
        maxTotalExposurePct: MAX_TOTAL_EXPOSURE_PCT,
      });
    }

    if (isReversal && currentOpen) {
      const entry = Number(currentOpen.entry_price ?? currentOpen.price ?? 0);
      const closePrice = price;
      const pnlData = calcPnl(currentOpen.side, entry, closePrice);

      const now = new Date().toISOString();

      const { error: closeError } = await supabase
        .from("signals")
        .update({
          status: "CLOSED",
          closed_at: now,
          close_price: closePrice,
          close_reason: "REVERSAL",
          lifecycle_status: "REVERSAL",
          current_price: closePrice,
          pnl: pnlData.pnl,
          pnl_pct: pnlData.pnl_pct,
          last_price_at: now,
        })
        .eq("id", currentOpen.id);

      if (closeError) {
        return NextResponse.json(
          {
            success: false,
            error: closeError.message,
          },
          { status: 500 }
        );
      }
    }

    const riskLevels = calcRiskLevels(side, price);

    const { data: inserted, error: insertError } = await supabase
      .from("signals")
      .insert([
        {
          symbol,
          side,
          price,

          entry_price: price,
          current_price: price,

          pnl: 0,
          pnl_pct: 0,

          sl_price: riskLevels.sl_price,
          tp1_price: riskLevels.tp1_price,
          tp2_price: riskLevels.tp2_price,
          trailing_price: riskLevels.trailing_price,

          risk_pct: riskLevels.risk_pct,

          quantity,
          notional,
          exposure_pct: exposurePct,

          quality_score: qualityScore,
          quality_band: qualityBandValue,

          strategy_tag: body.strategyTag ?? null,
          timeframe: body.timeframe ?? null,
          signal_raw: body,

          lifecycle_status: "OPEN",
          status: "OPEN",
        },
      ])
      .select();

    if (insertError) {
      return NextResponse.json(
        {
          success: false,
          error: insertError.message,
          received: body,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      action: isReversal ? "REVERSAL_EXECUTED" : "NEW_POSITION_OPENED",
      inserted,
      riskLevels,
      riskEngine: {
        maxOpenPositions: MAX_OPEN_POSITIONS,
        openCountBefore: allOpen.length,
        exposurePct,
        projectedTotalExposure,
        maxSingleExposurePct: MAX_SINGLE_EXPOSURE_PCT,
        maxTotalExposurePct: MAX_TOTAL_EXPOSURE_PCT,
        qualityScore,
        qualityBand: qualityBandValue,
        minQualityScore: MIN_QUALITY_SCORE,
        cooldownMinutes: COOLDOWN_MINUTES,
      },
      received: body,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      { status: 500 }
    );
  }
}