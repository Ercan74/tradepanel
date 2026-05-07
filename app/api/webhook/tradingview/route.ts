import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
    const side =
      rawSide === "BUY" || rawSide === "LONG"
        ? "LONG"
        : rawSide === "SELL" || rawSide === "SHORT"
        ? "SHORT"
        : rawSide;

    const symbol = body.symbol || body.ticker || "UNKNOWN";
    const price = Number(body.price || body.close || 0);

    const { data, error } = await supabase
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

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message, received: body },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      inserted: data,
      received: body,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}