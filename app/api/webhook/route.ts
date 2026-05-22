import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PositionSide = "LONG" | "SHORT";

type TvPayload = {
  secret?: string;
  symbol?: string;
  ticker?: string;
  order_action?: string;
  orderSide?: string;
  side?: string;
  signal?: string;
  event?: string;
  price?: number | string;
  close?: number | string;
  tp_price?: number | string;
  sl_price?: number | string;
  tp?: number | string;
  sl?: number | string;
  quantity?: number | string;
  quality_score?: number | string;
  qualityScore?: number | string;
  strategyTag?: string;
  timeframe?: string;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase server environment variables.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}

function normalizeSide(payload: TvPayload): PositionSide | null {
  const raw = String(
    payload.order_action ?? payload.orderSide ?? payload.side ?? ""
  ).toUpperCase();

  if (raw === "BUY" || raw === "LONG") return "LONG";
  if (raw === "SELL" || raw === "SHORT") return "SHORT";

  return null;
}

function oppositeSide(side: PositionSide): PositionSide {
  return side === "LONG" ? "SHORT" : "LONG";
}

function normalizeSymbol(payload: TvPayload) {
  const raw = payload.symbol ?? payload.ticker ?? "UNKNOWN";

  return String(raw)
    .replace("BIST:", "")
    .trim()
    .toUpperCase();
}

function toNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizeEvent(payload: TvPayload, side: PositionSide) {
  const raw = String(payload.event ?? payload.signal ?? "").toUpperCase();

  if (raw.includes("TAKE_PROFIT") || raw === "TP" || raw.includes("TP_HIT")) {
    return "TAKE_PROFIT";
  }

  if (raw.includes("STOP_LOSS") || raw === "SL" || raw.includes("SL_HIT")) {
    return "STOP_LOSS";
  }

  if (raw.includes("REVERSAL")) {
    return "REVERSAL";
  }

  if (raw.includes("CONFIRMED") || raw.includes("EXECUTION")) {
    return side === "LONG" ? "CONFIRMED_BUY" : "CONFIRMED_SELL";
  }

  return side === "LONG" ? "CONFIRMED_BUY" : "CONFIRMED_SELL";
}

function calcPnlPct(side: PositionSide, entryPrice: number, exitPrice: number) {
  if (!entryPrice || !exitPrice) return 0;

  if (side === "LONG") {
    return ((exitPrice - entryPrice) / entryPrice) * 100;
  }

  return ((entryPrice - exitPrice) / entryPrice) * 100;
}

function calcDefaultTp(side: PositionSide, price: number) {
  return side === "LONG" ? price * 1.04 : price * 0.96;
}

function calcDefaultSl(side: PositionSide, price: number) {
  return side === "LONG" ? price * 0.98 : price * 1.02;
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const webhookSecret = process.env.TRADINGVIEW_WEBHOOK_SECRET;

    const payload = (await request.json()) as TvPayload;

    if (webhookSecret && payload.secret !== webhookSecret) {
      return NextResponse.json(
        { ok: false, error: "Invalid webhook secret" },
        { status: 401 }
      );
    }

    const side = normalizeSide(payload);

    if (!side) {
      return NextResponse.json(
        { ok: false, error: "Invalid side" },
        { status: 400 }
      );
    }

    const symbol = normalizeSymbol(payload);
    const ticker = payload.ticker ?? `BIST:${symbol}`;
    const price = toNumber(payload.price ?? payload.close);

    if (!symbol || !price) {
      return NextResponse.json(
        { ok: false, error: "Invalid symbol or price" },
        { status: 400 }
      );
    }

    const eventType = normalizeEvent(payload, side);
    const strategyTag = payload.strategyTag ?? "EMA100_PRO";
    const quantity = toNumber(payload.quantity, 1);
    const qualityScore = toNumber(
      payload.quality_score ?? payload.qualityScore,
      0
    );

    await supabase.from("execution_events").insert({
      symbol,
      event_type: eventType,
      side,
      price,
      quality_score: qualityScore,
      strategy_tag: strategyTag,
      raw_payload: payload,
      processed: false,
    });

    const { data: openPositions, error: openError } = await supabase
      .from("positions")
      .select("*")
      .eq("symbol", symbol)
      .eq("status", "OPEN")
      .order("opened_at", { ascending: false })
      .limit(1);

    if (openError) {
      throw openError;
    }

    const openPosition = openPositions?.[0];

    if (eventType === "TAKE_PROFIT" || eventType === "STOP_LOSS") {
      if (!openPosition) {
        await supabase.from("position_events").insert({
          symbol,
          event_type: "IGNORED_EXIT_NO_OPEN_POSITION",
          side,
          price,
          message: `${eventType} ignored because no open position exists`,
          payload,
        });

        return NextResponse.json({
          ok: true,
          action: "IGNORED_EXIT_NO_OPEN_POSITION",
          symbol,
        });
      }

      const pnlPct = calcPnlPct(
        openPosition.side,
        toNumber(openPosition.entry_price),
        price
      );

      await supabase
        .from("positions")
        .update({
          status: eventType === "TAKE_PROFIT" ? "TP_CLOSED" : "SL_CLOSED",
          exit_price: price,
          pnl_pct: pnlPct,
          closed_at: new Date().toISOString(),
          last_event_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", openPosition.id);

      await supabase.from("position_events").insert({
        position_id: openPosition.id,
        symbol,
        event_type: eventType,
        side: openPosition.side,
        price,
        message: `${symbol} ${openPosition.side} closed by ${eventType}`,
        payload,
      });

      return NextResponse.json({
        ok: true,
        action: eventType,
        symbol,
        pnlPct,
      });
    }

    if (openPosition && openPosition.side === side) {
      await supabase.from("position_events").insert({
        position_id: openPosition.id,
        symbol,
        event_type: "DUPLICATE_SIGNAL_IGNORED",
        side,
        price,
        message: `${symbol} already has open ${side} position`,
        payload,
      });

      return NextResponse.json({
        ok: true,
        action: "DUPLICATE_SIGNAL_IGNORED",
        symbol,
        side,
      });
    }

    if (openPosition && openPosition.side === oppositeSide(side)) {
      const pnlPct = calcPnlPct(
        openPosition.side,
        toNumber(openPosition.entry_price),
        price
      );

      await supabase
        .from("positions")
        .update({
          status: "REVERSED",
          exit_price: price,
          pnl_pct: pnlPct,
          closed_at: new Date().toISOString(),
          last_event_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", openPosition.id);

      await supabase.from("position_events").insert({
        position_id: openPosition.id,
        symbol,
        event_type: "REVERSAL_CLOSE",
        side: openPosition.side,
        price,
        message: `${symbol} ${openPosition.side} closed by reversal`,
        payload,
      });
    }

    const tpPrice = toNumber(
      payload.tp_price ?? payload.tp,
      calcDefaultTp(side, price)
    );

    const slPrice = toNumber(
      payload.sl_price ?? payload.sl,
      calcDefaultSl(side, price)
    );

    const { data: newPosition, error: insertError } = await supabase
      .from("positions")
      .insert({
        symbol,
        ticker,
        side,
        status: "OPEN",
        entry_price: price,
        current_price: price,
        tp_price: tpPrice,
        sl_price: slPrice,
        quantity,
        quality_score: qualityScore,
        strategy_tag: strategyTag,
        source: "TRADINGVIEW",
        last_event_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    await supabase.from("position_events").insert({
      position_id: newPosition.id,
      symbol,
      event_type: openPosition ? "REVERSAL_OPEN" : "POSITION_OPENED",
      side,
      price,
      message: `${symbol} ${side} opened`,
      payload,
    });

    return NextResponse.json({
      ok: true,
      action: openPosition ? "REVERSAL_OPEN" : "POSITION_OPENED",
      symbol,
      side,
      entry: price,
      tp: tpPrice,
      sl: slPrice,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Unknown webhook error",
      },
      { status: 500 }
    );
  }
}