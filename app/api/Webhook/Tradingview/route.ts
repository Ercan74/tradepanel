import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const rawAction = body.side || body.order_action || body.orderSide;

    const side =
      rawAction === "BUY" || rawAction === "LONG"
        ? "LONG"
        : rawAction === "SELL" || rawAction === "SHORT"
        ? "SHORT"
        : "UNKNOWN";

    const symbol = body.symbol || body.ticker || "UNKNOWN";
    const price = body.price || body.close || null;
    const status = body.status || "OPEN";

    const { data, error } = await supabase
      .from("signals")
      .insert([
        {
          symbol,
          side,
          price,
          status,
        },
      ])
      .select();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}