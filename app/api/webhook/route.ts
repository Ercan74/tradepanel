import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Side = "LONG" | "SHORT";
type EventType =
  | "CONFIRMED_EXECUTION"
  | "TAKE_PROFIT"
  | "STOP_LOSS"
  | "MANUAL_CLOSE"
  | "UNKNOWN";

const ACCOUNT_CAPITAL = Number(process.env.ACCOUNT_CAPITAL ?? 100_000);
const MAX_OPEN_POSITIONS = Number(process.env.MAX_OPEN_POSITIONS ?? 10);
const POSITION_BUDGET = ACCOUNT_CAPITAL / MAX_OPEN_POSITIONS;
const STOP_LOSS_PCT = Number(process.env.STOP_LOSS_PCT ?? 3);
const TP1_PCT = Number(process.env.TP1_PCT ?? 6);
const MIN_QUALITY_SCORE = Number(process.env.MIN_QUALITY_SCORE ?? 70);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK_SECRET =
  process.env.TRADINGVIEW_WEBHOOK_SECRET ?? "ema100_secret_2026";

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "tradepanel-webhook",
    accountCapital: ACCOUNT_CAPITAL,
    maxOpenPositions: MAX_OPEN_POSITIONS,
    positionBudget: POSITION_BUDGET,
    stopLossPct: STOP_LOSS_PCT,
    tp1Pct: TP1_PCT,
    minQualityScore: MIN_QUALITY_SCORE,
  });
}

export async function POST(req: NextRequest) {
  let signalId: string | null = null;

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
    const side = normalizeSide(
      payload.side ?? payload.order_action ?? payload.orderSide
    );
    const event = normalizeEvent(payload.event ?? payload.signal);
    const alertPrice = toNumber(payload.price ?? payload.close);
    const qualityScore = toNumber(payload.quality_score ?? payload.score, 0) ?? 0;

    const strategyTag = String(
      payload.strategyTag ??
        payload.strategy_tag ??
        payload.strategy ??
        "EMA100_PRO"
    );

    const timeframe = normalizeTimeframe(
      payload.timeframe ?? payload.tf ?? payload.interval
    );

    if (!symbol || !side || !alertPrice) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const signalRecord = await insertExecutionEvent({
      symbol,
      side,
      event_type: event,
      price: alertPrice,
      quantity: null,
      quality_score: qualityScore,
      strategy_tag: strategyTag,
      timeframe,
      raw_payload: payload,
      processed: false,
      decision: "RECEIVED",
      telegram_status: "PENDING",
    });

    signalId = signalRecord?.id ?? null;

    const symbolRule = await getSymbolRule(symbol);
    const shortAllowed = symbolRule.shortAllowed;
    const live = await getLivePrice(symbol);

    const dataStatus = live?.lastPrice ? "MATRIKS_DDE" : "NEEDS_DDE_CHECK";
    const dataWarning = live?.lastPrice
      ? null
      : "Live price not found. Add this symbol to Matriks DDE Excel list.";

    const { data: symbolOpenPositions, error: symbolOpenError } = await supabase
      .from("positions")
      .select("*")
      .eq("symbol", symbol)
      .eq("status", "OPEN")
      .order("opened_at", { ascending: false });

    if (symbolOpenError) throw symbolOpenError;

    const sameContextPosition = (symbolOpenPositions ?? []).find((p) => {
      const pStrategy = String(p.strategy_tag ?? "EMA100_PRO");
      const pTimeframe = normalizeTimeframe(p.timeframe);
      return pStrategy === strategyTag && pTimeframe === timeframe;
    });

    const differentContextPosition = (symbolOpenPositions ?? []).find((p) => {
      const pStrategy = String(p.strategy_tag ?? "EMA100_PRO");
      const pTimeframe = normalizeTimeframe(p.timeframe);
      return pStrategy !== strategyTag || pTimeframe !== timeframe;
    });

    if (!sameContextPosition && differentContextPosition) {
      const reason = "TIMEFRAME_MISMATCH";

      await insertPositionEvent({
        position_id: differentContextPosition.id,
        symbol,
        side,
        event_type: "IGNORE_TIMEFRAME_MISMATCH",
        price: alertPrice,
        message: reason,
        payload,
      });

      await notifyRejected(signalId, {
        symbol,
        side,
        reason,
        message:
          `Açık pozisyon farklı timeframe/stratejiye ait. ` +
          `Açık: ${differentContextPosition.timeframe}, Gelen: ${timeframe}`,
        qualityScore,
      });

      return NextResponse.json({
        ok: true,
        action: "REJECTED_TIMEFRAME_MISMATCH",
        symbol,
      });
    }

    if (
      event === "TAKE_PROFIT" ||
      event === "STOP_LOSS" ||
      event === "MANUAL_CLOSE"
    ) {
      if (!sameContextPosition) {
        await notifyRejected(signalId, {
          symbol,
          side,
          reason: "NO_MATCHING_POSITION",
          message: "Kapanış sinyali geldi ama eşleşen açık pozisyon bulunamadı.",
          qualityScore,
        });

        return NextResponse.json({
          ok: true,
          action: "REJECTED_NO_MATCHING_POSITION",
          symbol,
        });
      }

      const result = await closePosition({
        position: sameContextPosition,
        exitPrice: alertPrice,
        closeReason: event,
        payload,
      });

      await updateSignalDecision(signalId, {
        decision: "ACCEPTED_CLOSE",
        rejectReason: null,
        telegramStatus: "SENT",
      });

      await sendTelegramMessage(
        `⚫ POZİSYON KAPANDI\n\n` +
          `Sembol: ${symbol}\n` +
          `Yön: ${sameContextPosition.side}\n` +
          `Sebep: ${event}\n\n` +
          `Giriş: ${formatPrice(result.entry)}\n` +
          `Çıkış: ${formatPrice(alertPrice)}\n\n` +
          `Sonuç: ${formatTl(result.pnlAmount)}\n` +
          `Getiri: ${formatPct(result.pnlPct)}`
      );

      return NextResponse.json({
        ok: true,
        action: event,
        symbol,
        pnlAmount: result.pnlAmount,
        pnlPct: result.pnlPct,
      });
    }

    if (side === "SHORT" && !sameContextPosition && !shortAllowed) {
      await notifyRejected(signalId, {
        symbol,
        side,
        reason: "SHORT_NOT_ALLOWED",
        message:
          "Bu sembol X50/açığa satış uygun listesinde değil. Açık LONG olmadığı için sinyal yok sayıldı.",
        qualityScore,
      });

      return NextResponse.json({
        ok: true,
        action: "REJECTED_SHORT_NOT_ALLOWED",
        symbol,
      });
    }

    if (sameContextPosition) {
      if (sameContextPosition.side === side) {
        await insertPositionEvent({
          position_id: sameContextPosition.id,
          symbol,
          side,
          event_type: "DUPLICATE_IGNORED",
          price: alertPrice,
          message: "Duplicate signal ignored.",
          payload,
        });

        await notifyRejected(signalId, {
          symbol,
          side,
          reason: "DUPLICATE_POSITION",
          message: "Aynı yönde açık pozisyon zaten var.",
          qualityScore,
        });

        return NextResponse.json({
          ok: true,
          action: "REJECTED_DUPLICATE_POSITION",
          symbol,
        });
      }

      const closed = await closePosition({
        position: sameContextPosition,
        exitPrice: alertPrice,
        closeReason: "REVERSAL",
        payload,
      });

      if (side === "SHORT" && !shortAllowed) {
        await notifyRejected(signalId, {
          symbol,
          side,
          reason: "LONG_CLOSED_SHORT_NOT_ALLOWED",
          message:
            "SHORT sinyali mevcut LONG pozisyonu kapattı; ancak sembol X50 dışında olduğu için yeni SHORT açılmadı.",
          qualityScore,
        });

        return NextResponse.json({
          ok: true,
          action: "LONG_CLOSED_SHORT_NOT_ALLOWED",
          symbol,
          closedPnlAmount: closed.pnlAmount,
        });
      }

      const canOpen = await validateNewOpen({ qualityScore });

      if (!canOpen.ok) {
        await notifyRejected(signalId, {
          symbol,
          side,
          reason: canOpen.action,
          message: canOpen.message,
          qualityScore,
        });

        return NextResponse.json({
          ok: true,
          action: `REVERSAL_CLOSED_BUT_${canOpen.action}`,
          symbol,
        });
      }

      const sizing = calculateSizing(alertPrice);
      const risk = calculateRiskLevels(side, alertPrice);

      const opened = await openPosition({
        symbol,
        side,
        price: alertPrice,
        quantity: sizing.quantity,
        allocatedAmount: sizing.allocatedAmount,
        risk,
        qualityScore,
        strategyTag,
        timeframe,
        payload,
        dataStatus,
        dataWarning,
        shortAllowed,
      });

      await insertPositionEvent({
        position_id: opened.id,
        symbol,
        side,
        event_type: "REVERSAL_OPEN",
        price: alertPrice,
        message: "Reversal opened.",
        payload,
      });

      await updateSignalDecision(signalId, {
        decision: "ACCEPTED_REVERSAL_OPEN",
        rejectReason: null,
        telegramStatus: "SENT",
      });

      await sendTelegramMessage(
        `🔄 REVERSAL\n\n` +
          `Sembol: ${symbol}\n` +
          `Kapanan: ${sameContextPosition.side}\n` +
          `Açılan: ${side}\n\n` +
          `Kapanış PnL: ${formatTl(closed.pnlAmount)}\n\n` +
          `Yeni Giriş: ${formatPrice(alertPrice)}\n` +
          `Lot: ${sizing.quantity}\n` +
          `Tutar: ${formatTl(sizing.allocatedAmount)}\n\n` +
          `Stop: ${formatPrice(risk.stopPrice)}\n` +
          `TP1: ${formatPrice(risk.tp1Price)}\n` +
          `Skor: ${qualityScore}`
      );

      return NextResponse.json({
        ok: true,
        action: "REVERSAL_OPEN",
        symbol,
      });
    }

    const canOpen = await validateNewOpen({ qualityScore });

    if (!canOpen.ok) {
      await notifyRejected(signalId, {
        symbol,
        side,
        reason: canOpen.action,
        message: canOpen.message,
        qualityScore,
      });

      return NextResponse.json({
        ok: true,
        action: canOpen.action,
        symbol,
      });
    }

    const sizing = calculateSizing(alertPrice);
    const risk = calculateRiskLevels(side, alertPrice);

    let opened: any;

    try {
      opened = await openPosition({
        symbol,
        side,
        price: alertPrice,
        quantity: sizing.quantity,
        allocatedAmount: sizing.allocatedAmount,
        risk,
        qualityScore,
        strategyTag,
        timeframe,
        payload,
        dataStatus,
        dataWarning,
        shortAllowed,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await notifyRejected(signalId, {
        symbol,
        side,
        reason: message.includes("MAX_OPEN_POSITIONS")
          ? "MAX_OPEN_POSITIONS_REACHED"
          : "POSITION_INSERT_ERROR",
        message,
        qualityScore,
      });

      return NextResponse.json({
        ok: true,
        action: "REJECTED_POSITION_INSERT_ERROR",
        symbol,
        error: message,
      });
    }

    await insertPositionEvent({
      position_id: opened.id,
      symbol,
      side,
      event_type: "POSITION_OPENED",
      price: alertPrice,
      message: "Position opened.",
      payload,
    });

    await updateSignalDecision(signalId, {
      decision: "ACCEPTED_OPEN",
      rejectReason: null,
      telegramStatus: "SENT",
    });

    await sendTelegramMessage(
      `🟢 YENİ POZİSYON\n\n` +
        `Sembol: ${symbol}\n` +
        `Yön: ${side}\n` +
        `TF: ${timeframe}\n\n` +
        `Giriş: ${formatPrice(alertPrice)}\n` +
        `Lot: ${sizing.quantity}\n` +
        `Tutar: ${formatTl(sizing.allocatedAmount)}\n\n` +
        `Stop: ${formatPrice(risk.stopPrice)}\n` +
        `TP1: ${formatPrice(risk.tp1Price)}\n\n` +
        `Skor: ${qualityScore}\n` +
        `Data: ${dataStatus}`
    );

    if (dataStatus === "NEEDS_DDE_CHECK") {
      await sendDdeWarningTelegram(symbol, side, timeframe);
    }

    return NextResponse.json({
      ok: true,
      action: "POSITION_OPENED",
      symbol,
      side,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("WEBHOOK_FATAL_ERROR", message);

    await updateSignalDecision(signalId, {
      decision: "ERROR_WEBHOOK",
      rejectReason: message,
      telegramStatus: "ERROR",
    }).catch(() => null);

    await sendTelegramMessage(
      `🔴 WEBHOOK HATASI\n\n` +
        `TradingView alarmı işlenirken hata oluştu.\n\n` +
        `Hata:\n${message}`
    ).catch(() => null);

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function insertExecutionEvent(input: any) {
  if (!supabase) throw new Error("Supabase not initialized");

  const p = input.raw_payload ?? {};

  const { data, error } = await supabase
    .from("signals")
    .insert({
      symbol: input.symbol,
      side: input.side,
      event_type: input.event_type,
      price: input.price,
      quantity: input.quantity,
      quality_score: Number(p.quality_score ?? input.quality_score ?? 0),
      quality_band: p.quality_band ?? null,
      strategy_tag: input.strategy_tag,
      timeframe: input.timeframe,
      status: "CONFIRMED",
      action: p.signal ?? input.event_type,
      raw_payload: p,

      rsi: toNumber(p.rsi),
      dist_atr: toNumber(p.distATR),
      macd: toNumber(p.macd),
      macd_hist: toNumber(p.hist),
      slope_pct: toNumber(p.slopePct),
      signal_state: p.state ?? null,
      macd_cross: p.cross ?? null,

      processed: input.processed ?? false,
      decision: input.decision ?? "RECEIVED",
      reject_reason: input.reject_reason ?? null,
      telegram_status: input.telegram_status ?? "PENDING",
      processed_at: input.processed_at ?? null,

      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) throw error;

  return data;
}

async function updateSignalDecision(
  signalId: string | null,
  input: {
    decision: string;
    rejectReason: string | null;
    telegramStatus: string;
  }
) {
  if (!supabase || !signalId) return;

  await supabase
    .from("signals")
    .update({
      decision: input.decision,
      reject_reason: input.rejectReason,
      telegram_status: input.telegramStatus,
      processed: true,
      processed_at: new Date().toISOString(),
    })
    .eq("id", signalId);
}

async function notifyRejected(
  signalId: string | null,
  input: {
    symbol: string;
    side: Side;
    reason: string;
    message: string;
    qualityScore: number;
  }
) {
  await updateSignalDecision(signalId, {
    decision: `REJECTED_${input.reason}`,
    rejectReason: input.message,
    telegramStatus: "SENT",
  });

  await sendTelegramMessage(
    `⛔ SİNYAL REDDEDİLDİ\n\n` +
      `Sembol: ${input.symbol}\n` +
      `Yön: ${input.side}\n\n` +
      `Sebep: ${input.message}\n\n` +
      `Skor: ${input.qualityScore}\n` +
      `Açık pozisyon limiti: ${MAX_OPEN_POSITIONS}`
  );
}

async function validateNewOpen({ qualityScore }: { qualityScore: number }) {
  if (!supabase) throw new Error("Supabase not initialized");

  if (qualityScore < MIN_QUALITY_SCORE) {
    return {
      ok: false,
      action: "LOW_QUALITY_SCORE",
      message: `Kalite skoru düşük. Skor ${qualityScore}, minimum ${MIN_QUALITY_SCORE}.`,
    };
  }

  const { count, error } = await supabase
    .from("positions")
    .select("id", { count: "exact", head: true })
    .eq("status", "OPEN");

  if (error) throw error;

  if ((count ?? 0) >= MAX_OPEN_POSITIONS) {
    return {
      ok: false,
      action: "MAX_OPEN_POSITIONS_REACHED",
      message: `Maksimum açık pozisyon limiti dolu. Açık: ${count}, limit: ${MAX_OPEN_POSITIONS}.`,
    };
  }

  return { ok: true, action: "OK", message: "OK" };
}

async function openPosition(input: any) {
  if (!supabase) throw new Error("Supabase not initialized");

  const quantity = Math.floor(Number(input.quantity));
  const entryPrice = toNumber(input.price, 0) ?? 0;
  const allocatedAmount = round2(quantity * entryPrice);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(`Invalid position quantity: ${input.quantity}`);
  }

  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    throw new Error(`Invalid entry price: ${input.price}`);
  }

  const { data, error } = await supabase
    .from("positions")
    .insert({
      symbol: input.symbol,
      side: input.side,
      timeframe: input.timeframe,
      strategy_tag: input.strategyTag,

      status: "OPEN",
      entry_price: entryPrice,
      current_price: entryPrice,
      quantity,
      remaining_quantity: quantity,
      allocated_amount: allocatedAmount,

      tp1_price: input.risk.tp1Price,
      stop_price: input.risk.stopPrice,
      sl_price: input.risk.stopPrice,
      trailing_stop_price: input.risk.stopPrice,
      trailing_stage: "INITIAL",
      risk_state: "INITIAL",

      quality_score: input.qualityScore,
      data_status: input.dataStatus,
      data_warning: input.dataWarning,
      short_allowed: input.shortAllowed,

      raw_payload: input.payload,
      opened_at: new Date().toISOString(),
      last_event_at: new Date().toISOString(),
    })
    .select("id")
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
  payload: any;
}) {
  if (!supabase) throw new Error("Supabase not initialized");

  const side = normalizeSide(position.side);
  const entry = toNumber(position.entry_price, 0) ?? 0;
  const qty = Math.floor(
    toNumber(position.remaining_quantity, 0) ??
      toNumber(position.quantity, 0) ??
      0
  );

  const pnlAmount =
    side === "LONG" ? (exitPrice - entry) * qty : (entry - exitPrice) * qty;

  const pnlPct =
    side === "LONG"
      ? ((exitPrice - entry) / entry) * 100
      : ((entry - exitPrice) / entry) * 100;

  const { error } = await supabase
    .from("positions")
    .update({
      status: "CLOSED",
      current_price: exitPrice,
      exit_price: exitPrice,
      close_price: exitPrice,
      close_reason: closeReason,
      pnl_amount: round2(pnlAmount),
      pnl_pct: round2(pnlPct),
      remaining_quantity: 0,
      closed_at: new Date().toISOString(),
      last_event_at: new Date().toISOString(),
      raw_exit_payload: payload,
    })
    .eq("id", position.id);

  if (error) throw error;

  return { entry, pnlAmount: round2(pnlAmount), pnlPct: round2(pnlPct) };
}

async function insertPositionEvent(input: any) {
  if (!supabase) throw new Error("Supabase not initialized");

  await supabase.from("position_events").insert({
    position_id: input.position_id,
    symbol: input.symbol,
    side: input.side,
    event_type: input.event_type,
    price: input.price,
    message: input.message,
    payload: input.payload,
    created_at: new Date().toISOString(),
  });
}

async function getLivePrice(symbol: string) {
  if (!supabase) throw new Error("Supabase not initialized");

  const { data } = await supabase
    .from("live_prices")
    .select("last_price,price,bid,ask,source,is_stale")
    .eq("symbol", symbol)
    .maybeSingle();

  const lastPrice =
    toNumber(data?.last_price, 0) ||
    toNumber(data?.price, 0) ||
    toNumber(data?.bid, 0) ||
    toNumber(data?.ask, 0) ||
    0;

  return {
    lastPrice,
    source: data?.source ?? null,
    isStale: Boolean(data?.is_stale),
  };
}

async function getSymbolRule(symbol: string) {
  if (!supabase) throw new Error("Supabase not initialized");

  const { data } = await supabase
    .from("market_symbol_rules")
    .select("short_allowed")
    .eq("symbol", symbol)
    .maybeSingle();

  return {
    shortAllowed: Boolean(data?.short_allowed),
  };
}

async function sendDdeWarningTelegram(symbol: string, side: Side, timeframe: string) {
  await sendTelegramMessage(
    `🟡 DDE LİSTE KONTROLÜ\n\n` +
      `Sembol: ${symbol}\n` +
      `Yön: ${side}\n` +
      `TF: ${timeframe}\n\n` +
      `Pozisyon açıldı ancak Matriks DDE canlı fiyatı bulunamadı.\n\n` +
      `Aksiyon: Bu sembolü Excel DDE listesine ekle.`
  );
}

function calculateSizing(price: number) {
  const safePrice = Number(price);

  if (!Number.isFinite(safePrice) || safePrice <= 0) {
    throw new Error(`Invalid entry price for sizing: ${price}`);
  }

  const quantity = Math.floor(POSITION_BUDGET / safePrice);
  const allocatedAmount = round2(quantity * safePrice);

  if (quantity <= 0) {
    throw new Error(
      `Position budget is not enough. Budget: ${POSITION_BUDGET}, price: ${safePrice}`
    );
  }

  return {
    quantity,
    allocatedAmount,
  };
}

function calculateRiskLevels(side: Side, entry: number) {
  const stopPrice =
    side === "LONG"
      ? entry * (1 - STOP_LOSS_PCT / 100)
      : entry * (1 + STOP_LOSS_PCT / 100);

  const tp1Price =
    side === "LONG"
      ? entry * (1 + TP1_PCT / 100)
      : entry * (1 - TP1_PCT / 100);

  return {
    stopPrice: round2(stopPrice),
    tp1Price: round2(tp1Price),
  };
}

function normalizeSymbol(value: unknown) {
  return String(value ?? "")
    .replace("BIST:", "")
    .replace("BISTMIXED:", "")
    .trim()
    .toUpperCase();
}

function normalizeSide(value: unknown): Side {
  const raw = String(value ?? "").toUpperCase();

  if (raw.includes("LONG") || raw.includes("BUY")) return "LONG";
  if (raw.includes("SHORT") || raw.includes("SELL")) return "SHORT";

  throw new Error(`Invalid side: ${value}`);
}

function normalizeEvent(value: unknown): EventType {
  const raw = String(value ?? "").toUpperCase();

  if (raw.includes("CONFIRMED")) return "CONFIRMED_EXECUTION";
  if (raw.includes("TAKE_PROFIT") || raw.includes("TP")) return "TAKE_PROFIT";
  if (raw.includes("STOP")) return "STOP_LOSS";
  if (raw.includes("MANUAL")) return "MANUAL_CLOSE";

  return "CONFIRMED_EXECUTION";
}

function normalizeTimeframe(value: unknown) {
  return String(value ?? "-").trim();
}

function toNumber(value: unknown, fallback: number | null = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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