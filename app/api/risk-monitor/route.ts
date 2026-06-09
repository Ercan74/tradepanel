import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Side = "LONG" | "SHORT";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const RISK_MONITOR_SECRET =
  process.env.RISK_MONITOR_SECRET ?? "ema100_secret_2026";

const ACCOUNT_CAPITAL = Number(process.env.ACCOUNT_CAPITAL ?? 100_000);
const STOP_LOSS_PCT = Number(process.env.STOP_LOSS_PCT ?? 3);
const TP1_PCT = Number(process.env.TP1_PCT ?? 6);
const TP1_SELL_RATIO = Number(process.env.TP1_SELL_RATIO ?? 0.5);

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

export async function GET(req: NextRequest) {
  try {
    const secret = req.nextUrl.searchParams.get("secret");

    if (secret !== RISK_MONITOR_SECRET) {
      return NextResponse.json(
        { ok: false, error: "Invalid risk monitor secret" },
        { status: 401 }
      );
    }

    if (!supabase) {
      return NextResponse.json(
        { ok: false, error: "Missing Supabase service role config" },
        { status: 500 }
      );
    }

    const { data: positions, error } = await supabase
      .from("positions")
      .select("*")
      .eq("status", "OPEN")
      .order("opened_at", { ascending: true });

    if (error) throw error;

    const actions: any[] = [];

    for (const position of positions ?? []) {
      const actionList = await processPosition(position);
      actions.push(...actionList);
    }

    return NextResponse.json({
      ok: true,
      checked: positions?.length ?? 0,
      actions,
      config: {
        accountCapital: ACCOUNT_CAPITAL,
        stopLossPct: STOP_LOSS_PCT,
        tp1Pct: TP1_PCT,
        tp1SellRatio: TP1_SELL_RATIO,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

async function processPosition(position: any) {
  if (!supabase) throw new Error("Supabase not initialized");

  const actions: any[] = [];

  const symbol = String(position.symbol);
  const side = normalizeSide(position.side);
  const entry = num(position.entry_price);
  const quantity = num(position.quantity, 0);
  const remainingQuantity = num(position.remaining_quantity, quantity);
  const tp1Hit = Boolean(position.tp1_hit);
  const current = await getCurrentPrice(position);

  if (!side || !entry || !current || !quantity || !remainingQuantity) {
    return actions;
  }

  const pnlPct = calcPnlPct(side, entry, current);
  const pnlAmount = calcPnlAmount(side, entry, current, remainingQuantity);

  const stopPrice = num(
    position.trailing_stop_price ??
      position.stop_price ??
      position.sl_price ??
      position.initial_stop_price
  );

  const stopHit =
    side === "LONG" ? current <= stopPrice : current >= stopPrice;

  if (stopPrice && stopHit) {
    const realizedPartial = num(position.realized_partial_amount, 0);
    const totalPnl = realizedPartial + pnlAmount;

    await supabase
      .from("positions")
      .update({
        status: "CLOSED",
        current_price: current,
        exit_price: current,
        close_price: current,
        close_reason: "STOP_LOSS",
        pnl_amount: totalPnl,
        pnl_pct: pnlPct,
        remaining_quantity: 0,
        risk_state: "CLOSED",
        trailing_stage: "CLOSED",
        closed_at: new Date().toISOString(),
        last_event_at: new Date().toISOString(),
      })
      .eq("id", position.id);

    await insertEvent(position.id, symbol, side, "STOP_LOSS", current, {
      message: `${symbol} stop oldu. Toplam PnL: ${totalPnl.toFixed(2)} TL.`,
    });

    await sendTelegramMessage(
      `🔴 STOP LOSS\n\n` +
        `Sembol: ${symbol}\n` +
        `Yön: ${side}\n\n` +
        `Giriş: ${formatPrice(entry)}\n` +
        `Çıkış: ${formatPrice(current)}\n` +
        `Lot: ${Math.round(remainingQuantity)}\n\n` +
        `Sonuç: ${formatTl(totalPnl)}\n` +
        `Getiri: ${formatPct(pnlPct)}\n\n` +
        `Pozisyon kapatıldı.`
    );

    actions.push({
      symbol,
      action: "STOP_LOSS",
      message: `${symbol} closed at ${current}. Total PnL ${totalPnl}.`,
    });

    return actions;
  }

  if (!tp1Hit) {
    const tp1Price =
      side === "LONG"
        ? entry * (1 + TP1_PCT / 100)
        : entry * (1 - TP1_PCT / 100);

    const reachedTp1 =
      side === "LONG" ? current >= tp1Price : current <= tp1Price;

    if (reachedTp1) {
      const sellQty = Math.floor(quantity * TP1_SELL_RATIO);
      const newRemainingQty = Math.max(0, quantity - sellQty);
      const realizedPartial = calcPnlAmount(side, entry, current, sellQty);

      await supabase
        .from("positions")
        .update({
          current_price: current,
          tp1_hit: true,
          tp1_hit_at: new Date().toISOString(),
          remaining_quantity: newRemainingQty,
          realized_partial_amount: realizedPartial,
          trailing_stage: "BREAKEVEN",
          risk_state: "TP1_HIT_TRAILING",
          trailing_stop_price: entry,
          stop_price: entry,
          sl_price: entry,
          best_price: current,
          last_event_at: new Date().toISOString(),
        })
        .eq("id", position.id);

      await insertEvent(position.id, symbol, side, "TP1_HALF_EXIT_ALERT", current, {
        message: `${symbol} TP1 gerçekleşti. ${sellQty} lot manuel satılmalı.`,
      });

      await sendTelegramMessage(
        `🔵 TP1 GERÇEKLEŞTİ\n\n` +
          `Sembol: ${symbol}\n` +
          `Yön: ${side}\n\n` +
          `Giriş: ${formatPrice(entry)}\n` +
          `Anlık: ${formatPrice(current)}\n\n` +
          `Satılacak Lot: ${sellQty}\n` +
          `Kalan Lot: ${newRemainingQty}\n\n` +
          `Stop Seviyesi: ${formatPrice(entry)}\n` +
          `Durum: BREAKEVEN AKTİF`
      );

      actions.push({
        symbol,
        action: "TP1_HALF_EXIT_ALERT",
        message: `${symbol} TP1 reached. Sell ${sellQty} lot manually.`,
      });

      return actions;
    }
  }

  if (tp1Hit) {
    const bestPrice = num(position.best_price, entry);
    const newBestPrice =
      side === "LONG" ? Math.max(bestPrice, current) : Math.min(bestPrice, current);

    const gainPct = calcPnlPct(side, entry, newBestPrice);
    const currentStage = String(position.trailing_stage ?? "BREAKEVEN");

    let nextStage = currentStage;
    let nextStop = num(position.trailing_stop_price, entry);

    if (gainPct >= 12 && currentStage !== "TRAIL_8") {
      nextStage = "TRAIL_8";
      nextStop =
        side === "LONG" ? entry * 1.08 : entry * 0.92;
    } else if (gainPct >= 9 && currentStage === "BREAKEVEN") {
      nextStage = "TRAIL_5";
      nextStop =
        side === "LONG" ? entry * 1.05 : entry * 0.95;
    }

    await supabase
      .from("positions")
      .update({
        current_price: current,
        best_price: newBestPrice,
        trailing_stage: nextStage,
        trailing_stop_price: round2(nextStop),
        stop_price: round2(nextStop),
        sl_price: round2(nextStop),
        pnl_amount: pnlAmount + num(position.realized_partial_amount, 0),
        pnl_pct: pnlPct,
        last_event_at: new Date().toISOString(),
      })
      .eq("id", position.id);

    if (nextStage !== currentStage) {
      await insertEvent(position.id, symbol, side, nextStage, current, {
        message: `${symbol} kar koruma seviyesi güncellendi: ${nextStage}. Yeni stop: ${round2(nextStop)}.`,
      });

      await sendTelegramMessage(
        `🟡 KAR KORUMA GÜNCELLENDİ\n\n` +
          `Sembol: ${symbol}\n` +
          `Yön: ${side}\n\n` +
          `Kar Seviyesi: ${formatPct(gainPct)}\n` +
          `Yeni Stop: ${formatPrice(round2(nextStop))}\n\n` +
          `Durum: ${nextStage}`
      );

      actions.push({
        symbol,
        action: nextStage,
        message: `${symbol} trailing updated. New stop ${round2(nextStop)}.`,
      });
    }
  }

  return actions;
}

async function getCurrentPrice(position: any) {
  if (!supabase) throw new Error("Supabase not initialized");

  const symbol = String(position.symbol);

  const { data } = await supabase
    .from("live_prices")
    .select("last_price,bid,ask,price,source,is_stale")
    .eq("symbol", symbol)
    .maybeSingle();

  const live =
    num(data?.last_price, 0) ||
    num(data?.price, 0) ||
    num(data?.bid, 0) ||
    num(data?.ask, 0);

  if (live > 0 && data?.source === "MATRIKS_DDE" && !data?.is_stale) {
    return live;
  }

  return num(position.current_price ?? position.entry_price, 0);
}

async function insertEvent(
  positionId: string,
  symbol: string,
  side: Side,
  eventType: string,
  price: number,
  payload: any
) {
  if (!supabase) throw new Error("Supabase not initialized");

  await supabase.from("position_events").insert({
    position_id: positionId,
    symbol,
    side,
    event_type: eventType,
    price,
    message: payload.message,
    payload,
    created_at: new Date().toISOString(),
  });
}

function normalizeSide(value: unknown): Side | null {
  const raw = String(value ?? "").toUpperCase();
  if (raw.includes("LONG") || raw.includes("BUY")) return "LONG";
  if (raw.includes("SHORT") || raw.includes("SELL")) return "SHORT";
  return null;
}

function num(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function calcPnlPct(side: Side, entry: number, current: number) {
  if (!entry || !current) return 0;
  return side === "LONG"
    ? ((current - entry) / entry) * 100
    : ((entry - current) / entry) * 100;
}

function calcPnlAmount(side: Side, entry: number, current: number, quantity: number) {
  return side === "LONG"
    ? (current - entry) * quantity
    : (entry - current) * quantity;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function formatPrice(value: number) {
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatTl(value: number) {
  return `${value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} TL`;
}

function formatPct(value: number) {
  return `%${value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}