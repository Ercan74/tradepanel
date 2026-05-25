import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Side = "LONG" | "SHORT";
type EventType =
  | "CONFIRMED_EXECUTION"
  | "TAKE_PROFIT"
  | "STOP_LOSS"
  | "MANUAL_CLOSE"
  | "UNKNOWN";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK_SECRET = process.env.TRADINGVIEW_WEBHOOK_SECRET ?? "ema100_secret_2026";

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "tradepanel-webhook",
    message: "Webhook endpoint is alive. Use POST for TradingView alerts.",
  });
}

export async function POST(req: NextRequest) {
  try {
    if (!supabase) {
      return NextResponse.json(
        { ok: false, error: "Missing Supabase server environment variables." },
        { status: 500 }
      );
    }

    const payload = await req.json();

    if (payload.secret !== WEBHOOK_SECRET) {
      return NextResponse.json(
        { ok: false, error: "Invalid webhook secret" },
        { status: 401 }
      );
    }

    const symbol = normalizeSymbol(payload.symbol ?? payload.ticker);
    const side = normalizeSide(payload.side ?? payload.order_action ?? payload.orderSide);
    const event = normalizeEvent(payload.event ?? payload.signal);
    const price = toNumber(payload.price ?? payload.close);
    const quantity = toNumber(payload.quantity ?? payload.qty ?? 1, 1) ?? 1;
    const tp = toNumber(payload.tp ?? payload.takeProfit ?? payload.tp_price);
    const sl = toNumber(payload.sl ?? payload.stopLoss ?? payload.sl_price);
    const qualityScore =  toNumber(payload.quality_score ?? payload.score, 0) ?? 0;
    const strategyTag = String(
      payload.strategyTag ?? payload.strategy_tag ?? payload.strategy ?? "EMA100_PRO"
    );
    const timeframe = normalizeTimeframe(payload.timeframe ?? payload.tf ?? payload.interval);

    if (!symbol || !side || !price) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing required fields",
          required: ["symbol/ticker", "order_action/side", "price/close"],
        },
        { status: 400 }
      );
    }

    await insertExecutionEvent({
      symbol,
      side,
      event_type: event,
      price,
      quantity,
      quality_score: qualityScore,
      strategy_tag: strategyTag,
      timeframe,
      raw_payload: payload,
      processed: false,
    });

    const { data: openPositions, error: openError } = await supabase
      .from("positions")
      .select("*")
      .eq("symbol", symbol)
      .eq("status", "OPEN")
      .order("opened_at", { ascending: false });

    if (openError) throw openError;

    const sameContextPosition = (openPositions ?? []).find((p) => {
      const pStrategy = String(p.strategy_tag ?? "EMA100_PRO");
      const pTimeframe = normalizeTimeframe(p.timeframe);
      return pStrategy === strategyTag && pTimeframe === timeframe;
    });

    const differentContextPosition = (openPositions ?? []).find((p) => {
      const pStrategy = String(p.strategy_tag ?? "EMA100_PRO");
      const pTimeframe = normalizeTimeframe(p.timeframe);
      return pStrategy !== strategyTag || pTimeframe !== timeframe;
    });

    if (!sameContextPosition && differentContextPosition) {
      await insertPositionEvent({
        position_id: differentContextPosition.id,
        symbol,
        side,
        event_type: "IGNORE_TIMEFRAME_MISMATCH",
        price,
        message: `Ignored ${side} signal. Open position belongs to ${differentContextPosition.strategy_tag}/${differentContextPosition.timeframe}, incoming signal is ${strategyTag}/${timeframe}.`,
        payload,
      });

      await markLatestExecutionProcessed(symbol, event);

      return NextResponse.json({
        ok: true,
        action: "IGNORE_TIMEFRAME_MISMATCH",
        symbol,
        incomingSide: side,
        incomingTimeframe: timeframe,
        incomingStrategy: strategyTag,
        openSide: differentContextPosition.side,
        openTimeframe: differentContextPosition.timeframe,
        openStrategy: differentContextPosition.strategy_tag,
      });
    }

    if (event === "TAKE_PROFIT" || event === "STOP_LOSS" || event === "MANUAL_CLOSE") {
      if (!sameContextPosition) {
        await insertPositionEvent({
          position_id: null,
          symbol,
          side,
          event_type: "IGNORE_CLOSE_NO_MATCHING_POSITION",
          price,
          message: `Ignored ${event}. No matching open position for ${symbol}/${strategyTag}/${timeframe}.`,
          payload,
        });

        return NextResponse.json({
          ok: true,
          action: "IGNORE_CLOSE_NO_MATCHING_POSITION",
          symbol,
          timeframe,
          strategyTag,
        });
      }

      const result = await closePosition({
        position: sameContextPosition,
        exitPrice: price,
        closeReason: event,
        payload,
      });

      await markLatestExecutionProcessed(symbol, event);

      return NextResponse.json({
        ok: true,
        action: event,
        symbol,
        side: sameContextPosition.side,
        entry: result.entry,
        exit: price,
        pnlAmount: result.pnlAmount,
        pnlPct: result.pnlPct,
        timeframe,
        strategyTag,
      });
    }

    if (sameContextPosition) {
      if (sameContextPosition.side === side) {
        await insertPositionEvent({
          position_id: sameContextPosition.id,
          symbol,
          side,
          event_type: "DUPLICATE_IGNORED",
          price,
          message: `Duplicate ${side} signal ignored for ${symbol}/${strategyTag}/${timeframe}.`,
          payload,
        });

        await markLatestExecutionProcessed(symbol, event);

        return NextResponse.json({
          ok: true,
          action: "DUPLICATE_IGNORED",
          symbol,
          side,
          timeframe,
          strategyTag,
        });
      }

      const closed = await closePosition({
        position: sameContextPosition,
        exitPrice: price,
        closeReason: "REVERSAL",
        payload,
      });

      const opened = await openPosition({
        symbol,
        side,
        price,
        quantity,
        tp,
        sl,
        qualityScore,
        strategyTag,
        timeframe,
        payload,
        lifecycleStatus: "OPEN",
      });

      await insertPositionEvent({
        position_id: opened.id,
        symbol,
        side,
        event_type: "REVERSAL_OPEN",
        price,
        message: `Reversal opened after closing ${sameContextPosition.side}.`,
        payload,
      });

      await markLatestExecutionProcessed(symbol, event);

      return NextResponse.json({
        ok: true,
        action: "REVERSAL_OPEN",
        symbol,
        side,
        entry: price,
        tp,
        sl,
        closedPnlAmount: closed.pnlAmount,
        closedPnlPct: closed.pnlPct,
        timeframe,
        strategyTag,
      });
    }

    const opened = await openPosition({
      symbol,
      side,
      price,
      quantity,
      tp,
      sl,
      qualityScore,
      strategyTag,
      timeframe,
      payload,
      lifecycleStatus: "OPEN",
    });

    await insertPositionEvent({
      position_id: opened.id,
      symbol,
      side,
      event_type: "POSITION_OPENED",
      price,
      message: `${side} position opened for ${symbol}/${strategyTag}/${timeframe}.`,
      payload,
    });

    await markLatestExecutionProcessed(symbol, event);

    return NextResponse.json({
      ok: true,
      action: "POSITION_OPENED",
      symbol,
      side,
      entry: price,
      tp,
      sl,
      timeframe,
      strategyTag,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

async function openPosition({
  symbol,
  side,
  price,
  quantity,
  tp,
  sl,
  qualityScore,
  strategyTag,
  timeframe,
  payload,
  lifecycleStatus,
}: {
  symbol: string;
  side: Side;
  price: number;
  quantity: number;
  tp: number | null;
  sl: number | null;
  qualityScore: number;
  strategyTag: string;
  timeframe: string;
  payload: unknown;
  lifecycleStatus: string;
}) {
  if (!supabase) throw new Error("Supabase not initialized");

  const { data, error } = await supabase
    .from("positions")
    .insert({
      symbol,
      side,
      status: lifecycleStatus,
      entry_price: price,
      current_price: price,
      tp_price: tp,
      sl_price: sl,
      quantity,
      notional: price * quantity,
      exposure_pct: 0,
      quality_score: qualityScore,
      quality_band: qualityScore >= 85 ? "A+" : qualityScore >= 70 ? "A" : "B",
      strategy_tag: strategyTag,
      timeframe,
      signal_raw: payload,
      opened_at: new Date().toISOString(),
      last_event_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function closePosition({
  position,
  exitPrice,
  closeReason,
  payload,
}: {
  position: any;
  exitPrice: number;
  closeReason: string;
  payload: unknown;
}) {
  if (!supabase) throw new Error("Supabase not initialized");

  const entry = toNumber(position.entry_price, 0);
  const quantity = toNumber(position.quantity, 1);
  const side = normalizeSide(position.side) as Side;

  const pnlPct = calcPnlPct(
  side,
  entry ?? 0,
  exitPrice ?? 0
);

const pnlAmount = calcPnlAmount(
  side,
  entry ?? 0,
  exitPrice ?? 0,
  quantity ?? 0
);

  const { error } = await supabase
    .from("positions")
    .update({
      status: "CLOSED",
      current_price: exitPrice,
      exit_price: exitPrice,
      close_price: exitPrice,
      close_reason: closeReason,
      pnl_pct: pnlPct,
      pnl_amount: pnlAmount,
      closed_at: new Date().toISOString(),
      last_event_at: new Date().toISOString(),
      signal_raw: payload,
    })
    .eq("id", position.id);

  if (error) throw error;

  await insertPositionEvent({
    position_id: position.id,
    symbol: position.symbol,
    side,
    event_type: closeReason,
    price: exitPrice,
    message: `${closeReason}: ${position.symbol} ${side} closed. PnL ${pnlAmount.toFixed(
      2
    )} TL / ${pnlPct.toFixed(2)}%.`,
    payload,
  });

  return {
    entry,
    exit: exitPrice,
    pnlPct,
    pnlAmount,
  };
}

async function insertExecutionEvent(data: Record<string, unknown>) {
  if (!supabase) throw new Error("Supabase not initialized");

  const { error } = await supabase.from("execution_events").insert({
    ...data,
    created_at: new Date().toISOString(),
  });

  if (error) throw error;
}

async function insertPositionEvent({
  position_id,
  symbol,
  side,
  event_type,
  price,
  message,
  payload,
}: {
  position_id: string | null;
  symbol: string;
  side: Side;
  event_type: string;
  price: number;
  message: string;
  payload: unknown;
}) {
  if (!supabase) throw new Error("Supabase not initialized");

  const { error } = await supabase.from("position_events").insert({
    position_id,
    symbol,
    side,
    event_type,
    price,
    message,
    payload,
    created_at: new Date().toISOString(),
  });

  if (error) throw error;
}

async function markLatestExecutionProcessed(symbol: string, eventType: string) {
  if (!supabase) return;

  const { data } = await supabase
    .from("execution_events")
    .select("id")
    .eq("symbol", symbol)
    .eq("event_type", eventType)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.id) return;

  await supabase
    .from("execution_events")
    .update({ processed: true })
    .eq("id", data.id);
}

function normalizeSymbol(value: unknown) {
  return String(value ?? "")
    .replace("BIST:", "")
    .replace("BIST.", "")
    .trim()
    .toUpperCase();
}

function normalizeSide(value: unknown): Side | null {
  const raw = String(value ?? "").toUpperCase();

  if (raw === "BUY" || raw === "LONG" || raw.includes("BUY") || raw.includes("LONG")) {
    return "LONG";
  }

  if (
    raw === "SELL" ||
    raw === "SHORT" ||
    raw.includes("SELL") ||
    raw.includes("SHORT")
  ) {
    return "SHORT";
  }

  return null;
}

function normalizeEvent(value: unknown): EventType {
  const raw = String(value ?? "").toUpperCase();

  if (raw.includes("TAKE_PROFIT") || raw === "TP") return "TAKE_PROFIT";
  if (raw.includes("STOP_LOSS") || raw === "SL") return "STOP_LOSS";
  if (raw.includes("MANUAL_CLOSE")) return "MANUAL_CLOSE";
  if (raw.includes("CONFIRMED") || raw.includes("EXECUTION")) return "CONFIRMED_EXECUTION";

  return "CONFIRMED_EXECUTION";
}

function normalizeTimeframe(value: unknown) {
  const raw = String(value ?? "").trim().toUpperCase();

  if (!raw || raw === "UNDEFINED" || raw === "NULL") return "UNKNOWN";

  if (raw === "1" || raw === "1M") return "1m";
  if (raw === "3" || raw === "3M") return "3m";
  if (raw === "5" || raw === "5M") return "5m";
  if (raw === "15" || raw === "15M") return "15m";
  if (raw === "30" || raw === "30M") return "30m";
  if (raw === "45" || raw === "45M") return "45m";
  if (raw === "60" || raw === "1H") return "1h";
  if (raw === "120" || raw === "2H") return "2h";
  if (raw === "240" || raw === "4H") return "4h";
  if (raw === "1D" || raw === "D" || raw === "DAY") return "1d";
  if (raw === "1W" || raw === "W" || raw === "WEEK") return "1w";

  return raw.toLowerCase();
}

function toNumber(value: unknown, fallback: number | null = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function calcPnlPct(side: Side, entry: number, exit: number) {
  if (!entry || !exit) return 0;

  if (side === "LONG") {
    return ((exit - entry) / entry) * 100;
  }

  return ((entry - exit) / entry) * 100;
}

function calcPnlAmount(side: Side, entry: number, exit: number, quantity: number) {
  if (side === "LONG") {
    return (exit - entry) * quantity;
  }

  return (entry - exit) * quantity;
}