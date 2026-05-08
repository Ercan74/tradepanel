import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function calcPnl(side: string, entry: number, current: number) {
  const pnl = side === "LONG" ? current - entry : entry - current;
  const pnlPct = entry ? (pnl / entry) * 100 : 0;

  return {
    pnl: Number(pnl.toFixed(4)),
    pnl_pct: Number(pnlPct.toFixed(4)),
  };
}

export async function GET() {
  const { data: positions, error } = await supabase
    .from("signals")
    .select("*")
    .eq("status", "OPEN");

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }

  const updates = [];

  for (const p of positions || []) {
    const entry = Number(p.entry_price ?? p.price ?? 0);
    const current = Number(p.current_price ?? entry);

    const randomMovePct = (Math.random() - 0.5) * 0.01;
    const newCurrent = Number((current * (1 + randomMovePct)).toFixed(4));

    const pnlData = calcPnl(p.side, entry, newCurrent);

    const { error: updateError } = await supabase
      .from("signals")
      .update({
        current_price: newCurrent,
        pnl: pnlData.pnl,
        pnl_pct: pnlData.pnl_pct,
        last_price_at: new Date().toISOString(),
      })
      .eq("id", p.id);

    if (updateError) {
      updates.push({
        id: p.id,
        symbol: p.symbol,
        success: false,
        error: updateError.message,
      });
    } else {
      updates.push({
        id: p.id,
        symbol: p.symbol,
        side: p.side,
        entry_price: entry,
        current_price: newCurrent,
        pnl: pnlData.pnl,
        pnl_pct: pnlData.pnl_pct,
        success: true,
      });
    }
  }

  return NextResponse.json({
    success: true,
    updated: updates.length,
    updates,
  });
}