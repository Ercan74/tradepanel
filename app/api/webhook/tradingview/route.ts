import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function normalizeSide(rawSide: string) {
  if (rawSide === "BUY" || rawSide === "LONG") return "LONG";
  if (rawSide === "SELL" || rawSide === "SHORT") return "SHORT";
  return rawSide;
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
    const side = normalizeSide(String(rawSide).toUpperCase());

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
        { success: false, error: fetchError.message, received: body },
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
      const { error: closeError } = await supabase
        .from("signals")
        .update({
          status: "CLOSED",
          closed_at: new Date().toISOString(),
        })
        .eq("id", currentOpen.id);

      if (closeError) {
        return NextResponse.json(
          { success: false, error: closeError.message, received: body },
          { status: 500 }
        );
      }
    }

    const { data: inserted, error: insertError } = await supabase
      .from("signals")
      .insert([
        {
          symbol,
          side,
          price,
          status: "OPEN",
        },
      ])
      .select();

    if (insertError) {
      return NextResponse.json(
        { success: false, error: insertError.message, received: body },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      action: currentOpen ? "REVERSAL_EXECUTED" : "NEW_POSITION_OPENED",
      inserted,
      closedPrevious: currentOpen || null,
      received: body,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}