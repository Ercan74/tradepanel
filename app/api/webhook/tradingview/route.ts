import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const SL_PCT = 0.02;
const TP1_PCT = 0.03;
const TP2_PCT = 0.05;

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

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "TradingView webhook endpoint is alive",
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
          error: "Missing symbol, side, or price",
          received: body,
        },
        { status: 400 }
      );
    }

    const { data: openPositions, error: fetchError } = await supabase
      .from("signals")
      .select("*")
      .eq("symbol", symbol)
      .eq("status", "OPEN")
      .order("created_at", { ascending: false })
      .limit(1);

    if (fetchError) {
      return NextResponse.json(
        {
          success: false,
          error: fetchError.message,
          received: body,
        },
        { status: 500 }
      );
    }

    const currentOpen = openPositions?.[0];

    if (currentOpen && currentOpen.side === side) {
      return NextResponse.json({
        success: true,
        action: "DUPLICATE_IGNORED",
        message: "Same symbol and same side already open",
        existing: currentOpen,
        received: body,
      });
    }

    if (currentOpen && currentOpen.side !== side) {
      const entry = Number(currentOpen.entry_price ?? currentOpen.price ?? 0);
      const closePrice = price;
      const pnlData = calcPnl(currentOpen.side, entry, closePrice);

      const { error: closeError } = await supabase
        .from("signals")
        .update({
          status: "CLOSED",
          closed_at: new Date().toISOString(),
          close_price: closePrice,
          close_reason: "REVERSAL",
          current_price: closePrice,
          pnl: pnlData.pnl,
          pnl_pct: pnlData.pnl_pct,
          last_price_at: new Date().toISOString(),
        })
        .eq("id", currentOpen.id);

      if (closeError) {
        return NextResponse.json(
          {
            success: false,
            error: closeError.message,
            received: body,
          },
          { status: 500 }
        );
      }
    }

    const riskLevels = calcRiskLevels(side, price);

    const { error: insertError } = await supabase.from("signals").insert([
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
        status: "OPEN",
      },
    ]);

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
      action: currentOpen ? "REVERSAL_EXECUTED" : "NEW_POSITION_OPENED",
      riskLevels,
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