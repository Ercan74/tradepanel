import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TRAILING_PCT = 0.01;

function round4(value: number) {
  return Number(value.toFixed(4));
}

function round2(value: number) {
  return Number(value.toFixed(2));
}

function calcPnl(side: string, entry: number, current: number) {
  const pnl = side === "LONG" ? current - entry : entry - current;
  const pnlPct = entry ? (pnl / entry) * 100 : 0;

  return {
    pnl: round4(pnl),
    pnl_pct: round4(pnlPct),
  };
}

function isTp1Hit(side: string, current: number, tp1: number) {
  if (!tp1) return false;

  if (side === "LONG") return round2(current) >= round2(tp1);
  if (side === "SHORT") return round2(current) <= round2(tp1);

  return false;
}

function isTp2Hit(side: string, current: number, tp2: number) {
  if (!tp2) return false;

  if (side === "LONG") return round2(current) >= round2(tp2);
  if (side === "SHORT") return round2(current) <= round2(tp2);

  return false;
}

function isSlHit(side: string, current: number, sl: number) {
  if (!sl) return false;

  if (side === "LONG") return round2(current) <= round2(sl);
  if (side === "SHORT") return round2(current) >= round2(sl);

  return false;
}

function updateTrailingPrice(position: any, current: number) {
  const side = position.side;
  const entry = Number(position.entry_price ?? position.price ?? 0);
  const oldTrailing = Number(position.trailing_price || position.sl_price || 0);

  if (!entry || !oldTrailing) return oldTrailing;

  if (side === "LONG") {
    const dynamicTrailing = current * (1 - TRAILING_PCT);
    return round4(Math.max(oldTrailing, entry, dynamicTrailing));
  }

  if (side === "SHORT") {
    const dynamicTrailing = current * (1 + TRAILING_PCT);
    return round4(Math.min(oldTrailing, entry, dynamicTrailing));
  }

  return oldTrailing;
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
    const newCurrent = round4(current * (1 + randomMovePct));

    const sl = Number(p.sl_price || 0);
    const tp1 = Number(p.tp1_price || 0);
    const tp2 = Number(p.tp2_price || 0);
    const oldTrailing = Number(p.trailing_price || sl || 0);

    const pnlData = calcPnl(p.side, entry, newCurrent);
    const now = new Date().toISOString();

    let closeReason: string | null = null;
    let lifecycleStatus = p.lifecycle_status || "OPEN";
    let tp1Hit = Boolean(p.tp1_hit);
    let trailingPrice = oldTrailing;

    if (isTp1Hit(p.side, newCurrent, tp1)) {
      tp1Hit = true;
      lifecycleStatus = "TRAILING";
      trailingPrice = updateTrailingPrice(p, newCurrent);
    }

    if (tp1Hit || lifecycleStatus === "TRAILING") {
      trailingPrice = updateTrailingPrice(
        { ...p, trailing_price: trailingPrice },
        newCurrent
      );

      if (isSlHit(p.side, newCurrent, trailingPrice)) {
        closeReason = "TRAILING_STOP_HIT";
      }
    } else if (isSlHit(p.side, newCurrent, sl)) {
      closeReason = "SL_HIT";
    }

    if (isTp2Hit(p.side, newCurrent, tp2)) {
      closeReason = "TP2_HIT";
    }

    const updatePayload: any = {
      current_price: newCurrent,
      pnl: pnlData.pnl,
      pnl_pct: pnlData.pnl_pct,
      last_price_at: now,
      tp1_hit: tp1Hit,
      trailing_price: trailingPrice,
      lifecycle_status: lifecycleStatus,
    };

    if (closeReason) {
      updatePayload.status = "CLOSED";
      updatePayload.closed_at = now;
      updatePayload.close_price = newCurrent;
      updatePayload.close_reason = closeReason;
      updatePayload.lifecycle_status = closeReason;
    }

    const { error: updateError } = await supabase
      .from("signals")
      .update(updatePayload)
      .eq("id", p.id)
      .eq("status", "OPEN");

    updates.push({
      id: p.id,
      symbol: p.symbol,
      side: p.side,
      entry_price: entry,
      current_price: newCurrent,
      trailing_price: trailingPrice,
      pnl: pnlData.pnl,
      pnl_pct: pnlData.pnl_pct,
      tp1_hit: tp1Hit,
      close_reason: closeReason,
      status: closeReason ? "CLOSED" : "OPEN",
      success: !updateError,
      error: updateError?.message,
    });
  }

  return NextResponse.json({
    success: true,
    updated: updates.length,
    updates,
  });
}