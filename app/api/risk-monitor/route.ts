import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { generateClientOrderId } from "@/lib/execution";
import { calcTotalPnlPct } from "@/lib/pnl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Side = "LONG" | "SHORT";

type MonitorAction = {
  symbol: string;
  action: string;
  message: string;
};

const ACCOUNT_CAPITAL = Number(process.env.ACCOUNT_CAPITAL ?? 100_000);
const MAX_OPEN_POSITIONS = Number(process.env.MAX_OPEN_POSITIONS ?? 10);
const STOP_LOSS_PCT = Number(process.env.STOP_LOSS_PCT ?? 3);
const TP1_PCT = Number(process.env.TP1_PCT ?? 6);
const TP1_SELL_RATIO = Number(process.env.TP1_SELL_RATIO ?? 0.5);

// ---------------------------------------------------------------------------
// Trailing stop ayar sabitleri (ince ayar için)
// ---------------------------------------------------------------------------

// Milestone kademeleri: PnL eşiği (%) aşıldığında stop entry ± lockPct'e
// çekilir. Stage adı lockPct'ten otomatik üretilir: 0 → BREAKEVEN,
// diğerleri → LOCK_{lockPct}. Kademeler artan sırada tanımlanmalı.
const TRAIL_MILESTONES: { pnlThreshold: number; lockPct: number }[] = [
  { pnlThreshold: 6, lockPct: 0 },   // BREAKEVEN — TP1 seviyesiyle senkron
  { pnlThreshold: 9, lockPct: 5 },   // LOCK_5
  { pnlThreshold: 12, lockPct: 8 },  // LOCK_8
  { pnlThreshold: 16, lockPct: 12 }, // LOCK_12
  { pnlThreshold: 20, lockPct: 16 }, // LOCK_16
  { pnlThreshold: 24, lockPct: 20 }, // LOCK_20
];

// ATR-trailing: TP1 vurulduktan sonra (BREAKEVEN ve üzeri stage) stop,
// best_price ∓ (çarpan × ATR) olarak da hesaplanır; milestone tabanıyla
// ikisinden pozisyonu DAHA ÇOK koruyan kullanılır. INITIAL'da devre dışı.
const TRAILING_ATR_MULTIPLIER = Number(process.env.TRAILING_ATR_MULTIPLIER ?? 2.0);

// Bildirim eşiği: stop güncellemesi DB'ye her zaman yazılır ama Telegram
// mesajı + position_events kaydı yalnızca stage değiştiğinde veya stop
// entry'nin en az bu yüzdesi kadar iyileştiğinde atılır (dakikalık cron'da
// mesaj florasını önler).
const TRAIL_NOTIFY_MIN_MOVE_PCT = Number(process.env.TRAIL_NOTIFY_MIN_MOVE_PCT ?? 0.5);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MONITOR_SECRET =
  process.env.RISK_MONITOR_SECRET ??
  process.env.TRADINGVIEW_WEBHOOK_SECRET ??
  "ema100_secret_2026";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

export async function GET(req: NextRequest) {
  return runMonitor(req);
}

export async function POST(req: NextRequest) {
  return runMonitor(req);
}

async function runMonitor(req: NextRequest) {
  try {
    if (!supabase) {
      return NextResponse.json(
        { ok: false, error: "Missing Supabase server environment variables." },
        { status: 500 }
      );
    }

    const secret =
      req.nextUrl.searchParams.get("secret") ??
      req.headers.get("x-monitor-secret") ??
      req.headers.get("authorization")?.replace("Bearer ", "");

    if (secret !== MONITOR_SECRET) {
      return NextResponse.json(
        { ok: false, error: "Invalid monitor secret" },
        { status: 401 }
      );
    }

    const { data: positions, error: posError } = await supabase
      .from("positions")
      .select("*")
      .eq("status", "OPEN")
      .order("opened_at", { ascending: true });

    if (posError) throw posError;

    const { data: livePrices, error: liveError } = await supabase
      .from("live_prices")
      .select("symbol,last_price,price,bid,ask,is_stale,source,last_trade_time,updated_at,atr");

    if (liveError) throw liveError;

    const liveMap = new Map<string, any>();

    (livePrices ?? []).forEach((row) => {
      liveMap.set(cleanSymbol(row.symbol), row);
    });

    const actions: MonitorAction[] = [];

    for (const position of positions ?? []) {
      const result = await processPosition(position, liveMap);
      actions.push(...result);
    }

    return NextResponse.json({
      ok: true,
      checked: positions?.length ?? 0,
      actions,
      config: {
        accountCapital: ACCOUNT_CAPITAL,
        maxOpenPositions: MAX_OPEN_POSITIONS,
        stopLossPct: STOP_LOSS_PCT,
        tp1Pct: TP1_PCT,
        tp1SellRatio: TP1_SELL_RATIO,
      },
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

async function processPosition(position: any, liveMap: Map<string, any>) {
  if (!supabase) throw new Error("Supabase not initialized");

  const actions: MonitorAction[] = [];

  const symbol = cleanSymbol(position.symbol);
  const side = normalizeSide(position.side);

  const entry = positiveNumber(position.entry_price);
  const quantity = Math.floor(positiveNumber(position.quantity) ?? 0);
  const remainingQuantity = Math.floor(
    positiveNumber(position.remaining_quantity) ?? quantity
  );

  if (!entry || !quantity || !remainingQuantity) {
    actions.push({
      symbol,
      action: "SKIPPED_INVALID_POSITION",
      message: `${symbol}: entry/quantity/remaining_quantity eksik.`,
    });
    return actions;
  }

  const live = liveMap.get(symbol);

 const livePrice =
    positiveNumber(live?.last_price) ??
    positiveNumber(live?.price) ??
    positiveNumber(live?.bid) ??
    positiveNumber(live?.ask);

// Live price yoksa stop kontrolü yapma — stale/eski fiyatla hatalı karar vermesin
if (!livePrice) {
    await sendTelegram(
        `⚠️ LIVE FİYAT YOK\n\n` +
        `Sembol: ${symbol}\n` +
        `Yön: ${side}\n\n` +
        `Stop kontrolü atlandı.\n` +
        `Aksiyon: Bu sembolü Matriks DDE Excel listesine ekle.`
    );
    actions.push({
        symbol,
        action: "NO_LIVE_PRICE_SKIP",
        message: `${symbol}: Live price yok, stop kontrolü atlandı. DDE listesini kontrol et.`,
    });
    return actions;
}

const current = livePrice;

if (!current) {
    actions.push({
        symbol,
        action: "NO_PRICE",
        message: `${symbol}: live_prices içinde geçerli fiyat bulunamadı.`,
    });
    return actions;
}

  const priceSource = livePrice ? "LIVE_PRICE" : "POSITION_CURRENT_PRICE";

  const defaultStop = calculateStopPrice(side, entry, STOP_LOSS_PCT);

  const activeStop =
    positiveNumber(position.trailing_stop_price) ??
    positiveNumber(position.stop_price) ??
    positiveNumber(position.sl_price) ??
    positiveNumber(position.initial_stop_price) ??
    defaultStop;

  const stopHit =
    side === "LONG" ? current <= activeStop : current >= activeStop;

  const pnlPct = calcPnlPct(side, entry, current);
  const pnlAmount = calcPnlAmount(side, entry, current, remainingQuantity);

  const previousBest = positiveNumber(position.best_price) ?? entry;
  const bestPrice =
    side === "LONG"
      ? Math.max(previousBest, current)
      : Math.min(previousBest, current);

  await supabase
    .from("positions")
    .update({
      current_price: current,
      best_price: bestPrice,
      last_event_at: new Date().toISOString(),
    })
    .eq("id", position.id);

  if (stopHit) {
    const realizedPartial = num(position.realized_partial_amount, 0);
    const totalPnl = round2(realizedPartial + pnlAmount);
    // Kapanış pnl_pct'i TOPLAM-bazlı (closePosition ile AYNI tanım, tek kaynak
    // lib/pnl.ts). NOT: yukarıdaki pnlPct (fiyat-hareketi %) açık-pozisyon
    // uyarıları/milestone için kullanılmaya devam eder — yalnız KAPANIŞ yazımı
    // toplam-bazlıya geçer.
    const initialQty = num(position.quantity, remainingQuantity);
    const totalPnlPct = calcTotalPnlPct(entry, initialQty, totalPnl);

    const reason =
      Boolean(position.tp1_hit) || String(position.trailing_stage).includes("LOCK")
        ? "TRAILING_STOP"
        : "STOP_LOSS";

    const { error } = await supabase
      .from("positions")
      .update({
        close_client_order_id: generateClientOrderId(),
        status: "CLOSED",
        current_price: current,
        exit_price: current,
        close_price: current,
        close_reason: reason,
        pnl_amount: totalPnl,
        pnl_pct: round2(totalPnlPct),
        remaining_quantity: 0,
        risk_state: "CLOSED",
        trailing_stage: "CLOSED",
        closed_at: new Date().toISOString(),
        last_event_at: new Date().toISOString(),
      })
      .eq("id", position.id);

    if (error) throw error;

    await insertPositionEvent({
      position_id: position.id,
      symbol,
      side,
      event_type: reason,
      price: current,
      message: `${symbol} ${side} ${reason}. Exit ${formatPrice(
        current
      )}. Stop ${formatPrice(activeStop)}. Total PnL ${formatTl(totalPnl)}.`,
      payload: {
        source: "risk-monitor",
        priceSource,
        live,
        entry,
        current,
        activeStop,
        remainingQuantity,
        realizedPartial,
      },
    });

    await sendTelegram(
      `🛑 ${reason}\n\n` +
        `Sembol: ${symbol}\n` +
        `Yön: ${side}\n\n` +
        `Giriş: ${formatPrice(entry)}\n` +
        `Çıkış: ${formatPrice(current)}\n` +
        `Stop: ${formatPrice(activeStop)}\n` +
        `Lot: ${remainingQuantity}\n\n` +
        `Sonuç: ${formatTl(totalPnl)}\n` +
        `Getiri: ${formatPct(pnlPct)}\n\n` +
        `Fiyat Kaynağı: ${priceSource}`
    );

    actions.push({
      symbol,
      action: reason,
      message: `${symbol} closed at ${current}. Stop ${activeStop}. PnL ${totalPnl}.`,
    });

    return actions;
  }

  const tp1Hit = Boolean(position.tp1_hit);

  const tp1Trigger =
    side === "LONG"
      ? round2(entry * (1 + TP1_PCT / 100))
      : round2(entry * (1 - TP1_PCT / 100));

  const reachedTp1 =
    side === "LONG" ? current >= tp1Trigger : current <= tp1Trigger;

  if (!tp1Hit && reachedTp1) {
    const sellQuantity = Math.max(1, Math.floor(quantity * TP1_SELL_RATIO));
    const newRemaining = Math.max(0, quantity - sellQuantity);
    const realized = round2(calcPnlAmount(side, entry, current, sellQuantity));
    const breakEvenStop = round2(entry);

    const { error } = await supabase
      .from("positions")
      .update({
        current_price: current,
        tp1_hit: true,
        tp1_hit_at: new Date().toISOString(),
        remaining_quantity: newRemaining,
        realized_partial_amount: realized,
        trailing_stage: "BREAKEVEN",
        trailing_stop_price: breakEvenStop,
        stop_price: breakEvenStop,
        risk_state: "TP1_HIT_TRAILING",
        last_event_at: new Date().toISOString(),
      })
      .eq("id", position.id);

    if (error) throw error;

    await insertPositionEvent({
      position_id: position.id,
      symbol,
      side,
      event_type: "TP1_HALF_EXIT_ALERT",
      price: current,
      message: `${symbol} ${side} TP1 reached. Suggested action: sell ${sellQuantity}/${quantity} lot manually. Remaining ${newRemaining}. Stop moved to breakeven ${formatPrice(
        breakEvenStop
      )}.`,
      payload: {
        source: "risk-monitor",
        priceSource,
        live,
        sellQuantity,
        newRemaining,
        realized,
        breakEvenStop,
      },
    });

    await sendTelegram(
      `✅ TP1 TETİKLENDİ\n\n` +
        `Sembol: ${symbol}\n` +
        `Yön: ${side}\n\n` +
        `Fiyat: ${formatPrice(current)}\n` +
        `TP1: ${formatPrice(tp1Trigger)}\n\n` +
        `Öneri: ${sellQuantity}/${quantity} lot sat.\n` +
        `Kalan: ${newRemaining} lot\n` +
        `Yeni Stop: ${formatPrice(breakEvenStop)}\n\n` +
        `Realize PnL: ${formatTl(realized)}`
    );

    actions.push({
      symbol,
      action: "TP1_HALF_EXIT_ALERT",
      message: `${symbol} TP1 reached. Sell ${sellQuantity} lot manually.`,
    });

    return actions;
  }

  const nextTrail = computeTrailingUpdate({
    side,
    entry,
    pnlPct,
    bestPrice,
    atr: positiveNumber(live?.atr),
    tp1Hit,
    currentStage: position.trailing_stage,
    activeStop,
  });

  if (nextTrail.shouldUpdate) {
    const { error } = await supabase
      .from("positions")
      .update({
        current_price: current,
        trailing_stage: nextTrail.stage,
        trailing_stop_price: nextTrail.stopPrice,
        stop_price: nextTrail.stopPrice,
        risk_state: "TRAILING_ACTIVE",
        last_event_at: new Date().toISOString(),
      })
      .eq("id", position.id);

    if (error) throw error;

    // Bildirim florası önlemi: stage değişmediyse ve iyileşme küçükse
    // DB güncellenir ama event/Telegram atlanır
    const stageChanged =
      nextTrail.stage !== String(position.trailing_stage ?? "INITIAL").toUpperCase();
    const stopMovePct = (Math.abs(nextTrail.stopPrice - activeStop) / entry) * 100;

    if (stageChanged || stopMovePct >= TRAIL_NOTIFY_MIN_MOVE_PCT) {
      await insertPositionEvent({
        position_id: position.id,
        symbol,
        side,
        event_type: "TRAILING_STOP_MOVED",
        price: current,
        message: `${symbol} ${side} trailing moved to ${formatPrice(
          nextTrail.stopPrice
        )} (${nextTrail.stage}, ${nextTrail.basis}).`,
        payload: {
          source: "risk-monitor",
          priceSource,
          live,
          pnlPct,
          nextTrail,
        },
      });

      await sendTelegram(
        `🔁 TRAILING STOP GÜNCELLENDİ\n\n` +
          `Sembol: ${symbol}\n` +
          `Yön: ${side}\n\n` +
          `Fiyat: ${formatPrice(current)}\n` +
          `PnL: ${formatPct(pnlPct)}\n` +
          `Yeni Stop: ${formatPrice(nextTrail.stopPrice)}\n` +
          `Stage: ${nextTrail.stage}\n` +
          `Yöntem: ${nextTrail.basis === "ATR_TRAIL" ? "ATR trailing" : "Milestone kilidi"}`
      );
    }

    actions.push({
      symbol,
      action: "TRAILING_STOP_MOVED",
      message: `${symbol} trailing stop moved to ${nextTrail.stopPrice} (${nextTrail.stage}, ${nextTrail.basis}).`,
    });
  }

  return actions;
}

function milestoneStageName(lockPct: number) {
  return lockPct === 0 ? "BREAKEVEN" : `LOCK_${lockPct}`;
}

// Stage sıralaması: INITIAL + milestone dizisinden türetilir; stage yalnızca
// bu sırada ileri gidebilir
const STAGE_ORDER = ["INITIAL", ...TRAIL_MILESTONES.map((m) => milestoneStageName(m.lockPct))];

function stageRank(stage: string) {
  const i = STAGE_ORDER.indexOf(stage);
  return i === -1 ? 0 : i;
}

function computeTrailingUpdate({
  side,
  entry,
  pnlPct,
  bestPrice,
  atr,
  tp1Hit,
  currentStage,
  activeStop,
}: {
  side: Side;
  entry: number;
  pnlPct: number;
  bestPrice: number;
  atr: number | null;
  tp1Hit: boolean;
  currentStage: unknown;
  activeStop: number;
}): { shouldUpdate: boolean; stage: string; stopPrice: number; basis: string } {
  const stage = String(currentStage ?? "INITIAL").toUpperCase();

  // 1) Milestone tabanı: aşılmış en yüksek PnL eşiği
  let milestone: { pnlThreshold: number; lockPct: number } | null = null;
  for (const m of TRAIL_MILESTONES) {
    if (pnlPct >= m.pnlThreshold) milestone = m;
  }

  // 2) ATR-trailing: yalnızca TP1 sonrası (BREAKEVEN ve üzeri stage)
  const trailingActive = tp1Hit || stage !== "INITIAL";
  const atrTrailStop =
    trailingActive && atr
      ? round2(
          side === "LONG"
            ? bestPrice - TRAILING_ATR_MULTIPLIER * atr
            : bestPrice + TRAILING_ATR_MULTIPLIER * atr
        )
      : null;

  // 3) İki yöntemden pozisyonu DAHA ÇOK koruyanı seç
  //    (LONG: daha yüksek stop, SHORT: daha düşük stop)
  let candidate: number | null = milestone
    ? stopFromEntry(side, entry, milestone.lockPct)
    : null;
  let basis = milestone ? "MILESTONE" : "NONE";

  if (
    atrTrailStop != null &&
    (candidate == null ||
      (side === "LONG" ? atrTrailStop > candidate : atrTrailStop < candidate))
  ) {
    candidate = atrTrailStop;
    basis = "ATR_TRAIL";
  }

  // Stage yalnızca ileri gidebilir
  const milestoneStage = milestone ? milestoneStageName(milestone.lockPct) : stage;
  const nextStage = stageRank(milestoneStage) > stageRank(stage) ? milestoneStage : stage;

  // 4) GÜVENLİK KURALI: stop asla gevşetilmez — aday, mevcut aktif stop'tan
  //    daha az koruyucuysa uygulanmaz, eski stop korunur
  const improves =
    candidate != null &&
    (side === "LONG" ? candidate > activeStop : candidate < activeStop);

  if (!improves && nextStage === stage) {
    return { shouldUpdate: false, stage, stopPrice: activeStop, basis: "NONE" };
  }

  return {
    shouldUpdate: true,
    stage: nextStage,
    stopPrice: improves && candidate != null ? candidate : activeStop,
    basis: improves ? basis : "KEEP_STOP",
  };
}

function calculateStopPrice(side: Side, entry: number, pct: number) {
  return side === "LONG"
    ? round2(entry * (1 - pct / 100))
    : round2(entry * (1 + pct / 100));
}

function stopFromEntry(side: Side, entry: number, lockPct: number) {
  return side === "LONG"
    ? round2(entry * (1 + lockPct / 100))
    : round2(entry * (1 - lockPct / 100));
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

async function sendTelegram(text: string) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("Telegram env missing");
    return;
  }

  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        disable_web_page_preview: true,
      }),
    }
  );

  if (!res.ok) {
    const responseText = await res.text();
    console.error("Telegram send failed", responseText);
  }
}

function normalizeSide(value: unknown): Side {
  const raw = String(value ?? "").toUpperCase();

  if (raw.includes("SHORT") || raw.includes("SELL")) return "SHORT";
  if (raw.includes("LONG") || raw.includes("BUY")) return "LONG";

  throw new Error(`Invalid side: ${value}`);
}

function cleanSymbol(value: unknown) {
  return String(value ?? "")
    .replace("BIST:", "")
    .replace("BISTMIXED:", "")
    .trim()
    .toUpperCase();
}

function positiveNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

function formatMoney(value: number) {
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPct(value: number) {
  return `%${value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}