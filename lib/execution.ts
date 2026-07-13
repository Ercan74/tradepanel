import { createClient } from "@supabase/supabase-js";
import { getStaticSector } from "./intelligence/portfolio/sectorMap";

// ---------------------------------------------------------------------------
// Pozisyon açma/kapama — ortak execution katmanı
//
// TradingView webhook'u, portfolio-ai-agent ve (gelecek) telegram-webhook
// route'ları bu fonksiyonları kullanır. Parametreler kaynak-bağımsızdır:
// TradingView payload'ı gibi kaynağa özgü objeler yalnızca opsiyonel
// rawPayload alanı üzerinden, olduğu gibi arşivlenmek için geçirilir.
// ---------------------------------------------------------------------------

export type Side = "LONG" | "SHORT";

const ACCOUNT_CAPITAL = Number(process.env.ACCOUNT_CAPITAL ?? 100_000);
const MAX_OPEN_POSITIONS = Number(process.env.MAX_OPEN_POSITIONS ?? 10);
const POSITION_BUDGET = ACCOUNT_CAPITAL / MAX_OPEN_POSITIONS;
const STOP_LOSS_PCT = Number(process.env.STOP_LOSS_PCT ?? 3);
const TP1_PCT = Number(process.env.TP1_PCT ?? 6);

// REDUCE kararı onaylandığında satılacak oran (kalan lotun yüzdesi).
// Gerçek kısmi kapanış 2026-07-13'te eklendi; öncesinde REDUCE yalnızca
// risk_state bayrağı set eden bir stub'dı.
const REDUCE_RATIO = Number(process.env.REDUCE_RATIO ?? 0.5);

// ATR-bazlı ilk stop: entry ± (ATR_STOP_MULTIPLIER × ATR).
// Sonuç MIN/MAX_STOP_PCT ile clamp'lenir; ATR verisi yoksa sabit
// STOP_LOSS_PCT (%3) fallback'i kullanılır.
const ATR_STOP_MULTIPLIER = Number(process.env.ATR_STOP_MULTIPLIER ?? 1.5);
const MIN_STOP_PCT = Number(process.env.MIN_STOP_PCT ?? 2); // stop entry'den en az %2 uzakta
const MAX_STOP_PCT = Number(process.env.MAX_STOP_PCT ?? 6); // stop entry'den en fazla %6 uzakta

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

export function toNumber(value: unknown, fallback: number | null = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Broker mutabakatı için kalıcı emir referansı üretir.
 * Format: TIOS-{yyyymmdd}-{kısa-uuid} (örn. TIOS-20260709-a1b2c3d4)
 * Açılışta positions.client_order_id, kapanışta close_client_order_id
 * alanına yazılır.
 */
export function generateClientOrderId(): string {
  const d = new Date();
  const ymd =
    `${d.getUTCFullYear()}` +
    `${String(d.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(d.getUTCDate()).padStart(2, "0")}`;
  const short = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `TIOS-${ymd}-${short}`;
}

export function normalizeSide(value: unknown): Side {
  const raw = String(value ?? "").toUpperCase();

  if (raw.includes("LONG") || raw.includes("BUY")) return "LONG";
  if (raw.includes("SHORT") || raw.includes("SELL")) return "SHORT";

  throw new Error(`Invalid side: ${value}`);
}

// ---------------------------------------------------------------------------
// Sizing ve risk seviyeleri
// ---------------------------------------------------------------------------

export interface SizingResult {
  quantity: number;
  allocatedAmount: number;
}

export function calculateSizing(
  price: number,
  budget: number = POSITION_BUDGET
): SizingResult {
  const safePrice = Number(price);

  if (!Number.isFinite(safePrice) || safePrice <= 0) {
    throw new Error(`Invalid entry price for sizing: ${price}`);
  }

  const quantity = Math.floor(budget / safePrice);
  const allocatedAmount = round2(quantity * safePrice);

  if (quantity <= 0) {
    throw new Error(
      `Position budget is not enough. Budget: ${budget}, price: ${safePrice}`
    );
  }

  return {
    quantity,
    allocatedAmount,
  };
}

export interface RiskLevels {
  stopPrice: number;
  tp1Price: number;
}

export function calculateRiskLevels(
  side: Side,
  entry: number,
  atr?: number | null
): RiskLevels {
  // Fallback: sabit yüzde stop (ATR verisi olmayan düşük likiditeli semboller)
  let stopDistance = entry * (STOP_LOSS_PCT / 100);

  if (atr != null && Number.isFinite(atr) && atr > 0) {
    const raw = ATR_STOP_MULTIPLIER * atr;
    const min = entry * (MIN_STOP_PCT / 100);
    const max = entry * (MAX_STOP_PCT / 100);
    stopDistance = Math.min(Math.max(raw, min), max);
  }

  const stopPrice = side === "LONG" ? entry - stopDistance : entry + stopDistance;

  const tp1Price =
    side === "LONG"
      ? entry * (1 + TP1_PCT / 100)
      : entry * (1 - TP1_PCT / 100);

  return {
    stopPrice: round2(stopPrice),
    tp1Price: round2(tp1Price),
  };
}

// ---------------------------------------------------------------------------
// Açığa satış uygunluğu
// ---------------------------------------------------------------------------

/**
 * Sembol açığa satışa uygun mu?
 *  - short_sell_eligible_symbols listesinde olmalı VE
 *  - short_sell_temp_exclusions'ta şu an aktif (from ≤ now ≤ until)
 *    bir geçici yasak (VBTS vb.) OLMAMALI.
 * Güvenli varsayılan: tablo boşsa, kayıt yoksa veya sorgu hata verirse false.
 * Bu kontrol yalnızca YENİ short açılışlarında kullanılır; mevcut açık
 * pozisyonların yönetimini/kapanışını etkilemez.
 */
export async function isShortSellEligible(symbol: string): Promise<boolean> {
  if (!supabase) return false;

  try {
    const sym = String(symbol ?? "").trim().toUpperCase();
    if (!sym) return false;

    // Genel açığa satış yasağı (SPK) — compliance-monitor günceller.
    // true ise veya bayrak okunamazsa güvenli varsayılan: her sembol için false.
    const { data: banSetting, error: banError } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "short_sell_globally_banned")
      .maybeSingle();

    if (banError || !banSetting || banSetting.value === true) return false;

    const nowIso = new Date().toISOString();

    const [eligibleRes, exclusionRes] = await Promise.all([
      supabase
        .from("short_sell_eligible_symbols")
        .select("symbol")
        .eq("symbol", sym)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("short_sell_temp_exclusions")
        .select("symbol")
        .eq("symbol", sym)
        .lte("excluded_from", nowIso)
        .gte("excluded_until", nowIso)
        .limit(1)
        .maybeSingle(),
    ]);

    if (eligibleRes.error || exclusionRes.error) return false;

    return Boolean(eligibleRes.data) && !exclusionRes.data;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Pozisyon açma
// ---------------------------------------------------------------------------

export interface OpenPositionParams {
  symbol: string;
  side: Side;
  price: number;
  quantity: number;
  risk: RiskLevels;
  qualityScore?: number | null;
  strategyTag?: string | null;
  timeframe?: string | null;
  sector?: string | null;
  dataStatus?: string | null;
  dataWarning?: string | null;
  shortAllowed?: boolean;
  rawPayload?: unknown;
}

export async function openPosition(params: OpenPositionParams) {
  if (!supabase) throw new Error("Supabase not initialized");

  // Açığa satış guard'ı — yalnızca SHORT açılışlar; LONG hiç kontrol edilmez
  if (params.side === "SHORT") {
    const eligible = await isShortSellEligible(params.symbol);
    if (!eligible) {
      throw new Error(
        `SHORT_NOT_ELIGIBLE: ${params.symbol} açığa satışa uygun değil (uygun listede yok veya aktif geçici yasak/VBTS)`
      );
    }
  }

  const quantity = Math.floor(Number(params.quantity));
  const entryPrice = toNumber(params.price, 0) ?? 0;
  const allocatedAmount = round2(quantity * entryPrice);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(`Invalid position quantity: ${params.quantity}`);
  }

  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    throw new Error(`Invalid entry price: ${params.price}`);
  }

  const { data, error } = await supabase
    .from("positions")
    .insert({
      client_order_id: generateClientOrderId(),
      symbol: params.symbol,
      side: params.side,
      timeframe: params.timeframe,
      strategy_tag: params.strategyTag,

      status: "OPEN",
      entry_price: entryPrice,
      current_price: entryPrice,
      quantity,
      remaining_quantity: quantity,
      allocated_amount: allocatedAmount,

      tp1_price: params.risk.tp1Price,
      stop_price: params.risk.stopPrice,
      sl_price: params.risk.stopPrice,
      trailing_stop_price: params.risk.stopPrice,
      trailing_stage: "INITIAL",
      risk_state: "INITIAL",

      quality_score: params.qualityScore,
      data_status: params.dataStatus,
      data_warning: params.dataWarning,
      short_allowed: params.shortAllowed,

      ...(params.sector ? { sector: params.sector } : {}),

      raw_payload: params.rawPayload,
      opened_at: new Date().toISOString(),
      last_event_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) throw error;

  return data;
}

// ---------------------------------------------------------------------------
// Pozisyon kapama
// ---------------------------------------------------------------------------

export interface ClosePositionParams {
  /** Kapatılacak açık pozisyonun satırı (en az id, side, entry_price, quantity/remaining_quantity). */
  position: {
    id: string;
    side: string;
    entry_price: number | string | null;
    quantity?: number | string | null;
    remaining_quantity?: number | string | null;
  };
  exitPrice: number;
  closeReason: string;
  rawPayload?: unknown;
}

export async function closePosition({
  position,
  exitPrice,
  closeReason,
  rawPayload,
}: ClosePositionParams) {
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
      close_client_order_id: generateClientOrderId(),
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
      raw_exit_payload: rawPayload ?? null,
    })
    .eq("id", position.id);

  if (error) throw error;

  return { entry, pnlAmount: round2(pnlAmount), pnlPct: round2(pnlPct) };
}

// ---------------------------------------------------------------------------
// AI kararı uygulayıcı — onay akışı (telegram-webhook ve reminder-check)
// ---------------------------------------------------------------------------

export interface AiDecisionRow {
  id: string;
  decision_type: string;
  symbol: string;
  reason?: string | null;
  suggested_side?: string | null;
  suggested_price?: number | null;
  suggested_qty?: number | null;
}

export interface ExecutionResult {
  ok: boolean;
  message: string;
}

/**
 * Onaylanan veya süre dolunca otomatik uygulanan bir ai_decisions kaydını
 * pozisyona çevirir. ai_decisions status/executed alanlarını GÜNCELLEMEZ —
 * bu, çağıran route'un sorumluluğudur.
 */
export async function executeAiDecision(
  decision: AiDecisionRow,
  trigger: "APPROVED" | "AUTO_EXECUTED"
): Promise<ExecutionResult> {
  if (!supabase) return { ok: false, message: "Supabase not initialized" };

  const type = String(decision.decision_type ?? "").toUpperCase();

  try {
    if (type === "CLOSE" || type === "SWAP") {
      const { data: pos } = await supabase
        .from("positions")
        .select("*")
        .eq("symbol", decision.symbol)
        .eq("status", "OPEN")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!pos) {
        return { ok: false, message: `${decision.symbol} için açık pozisyon bulunamadı` };
      }

      const { data: live } = await supabase
        .from("live_prices")
        .select("last_price")
        .eq("symbol", decision.symbol)
        .maybeSingle();

      const exitPrice =
        toNumber(live?.last_price, null) ??
        toNumber(pos.current_price, null) ??
        toNumber(pos.entry_price, 0) ??
        0;

      if (exitPrice <= 0) {
        return { ok: false, message: `${decision.symbol} için geçerli çıkış fiyatı bulunamadı` };
      }

      const result = await closePosition({
        position: pos,
        exitPrice,
        closeReason: `AI_DECISION_${trigger}: ${decision.reason ?? ""}`,
        rawPayload: { source: "ai_decision", decisionId: decision.id, trigger },
      });

      return {
        ok: true,
        message: `${decision.symbol} kapatıldı @ ${exitPrice} | PnL: ${result.pnlAmount} TL (%${result.pnlPct})`,
      };
    }

    if (type === "REDUCE") {
      // Gerçek kısmi kapanış — risk-monitor'ün TP1 yarı-çıkış muhasebesi
      // kalıbıyla: kalan lotun REDUCE_RATIO kadarı canlı fiyattan satılır,
      // realize PnL realized_partial_amount'a eklenir, remaining_quantity
      // düşer. (Eski stub yalnızca AI_REDUCE_FLAGGED bayrağı yazıyordu.)
      const { data: pos } = await supabase
        .from("positions")
        .select("id,side,entry_price,current_price,quantity,remaining_quantity,realized_partial_amount")
        .eq("symbol", decision.symbol)
        .eq("status", "OPEN")
        .limit(1)
        .maybeSingle();

      if (!pos) {
        return { ok: false, message: `${decision.symbol} için açık pozisyon bulunamadı` };
      }

      const remaining =
        Math.floor(toNumber(pos.remaining_quantity, 0) ?? 0) ||
        Math.floor(toNumber(pos.quantity, 0) ?? 0);

      if (remaining <= 1) {
        return {
          ok: false,
          message: `${decision.symbol} kalan lot (${remaining}) azaltma için çok küçük — CLOSE değerlendirilebilir`,
        };
      }

      const { data: live } = await supabase
        .from("live_prices")
        .select("last_price")
        .eq("symbol", decision.symbol)
        .maybeSingle();

      const price =
        toNumber(live?.last_price, null) ??
        toNumber(pos.current_price, null) ??
        toNumber(pos.entry_price, 0) ??
        0;

      if (price <= 0) {
        return { ok: false, message: `${decision.symbol} için geçerli fiyat bulunamadı` };
      }

      const side = normalizeSide(pos.side);
      const entry = toNumber(pos.entry_price, 0) ?? 0;
      const sellQuantity = Math.max(1, Math.floor(remaining * REDUCE_RATIO));
      const newRemaining = remaining - sellQuantity;
      const realized = round2(
        side === "LONG" ? (price - entry) * sellQuantity : (entry - price) * sellQuantity
      );
      const newRealizedTotal = round2(
        (toNumber(pos.realized_partial_amount, 0) ?? 0) + realized
      );

      const { error } = await supabase
        .from("positions")
        .update({
          current_price: price,
          remaining_quantity: newRemaining,
          realized_partial_amount: newRealizedTotal,
          last_event_at: new Date().toISOString(),
        })
        .eq("id", pos.id);

      if (error) throw error;

      // position_events kaydı — hatası azaltmayı geri almaz, yalnızca loglanır
      const { error: evError } = await supabase.from("position_events").insert({
        position_id: pos.id,
        symbol: decision.symbol,
        side,
        event_type: "AI_REDUCE_EXECUTED",
        price,
        message: `${decision.symbol} ${side} ${sellQuantity}/${remaining} lot azaltıldı @ ${price}. Realize ${realized} TL. Kalan ${newRemaining}.`,
        payload: {
          source: "ai_decision",
          decisionId: decision.id,
          trigger,
          reduceRatio: REDUCE_RATIO,
        },
        created_at: new Date().toISOString(),
      });
      if (evError) console.error("AI_REDUCE_EVENT_ERROR", evError.message);

      return {
        ok: true,
        message: `${decision.symbol} ${sellQuantity} lot azaltıldı @ ${price} | Realize: ${realized} TL | Kalan: ${newRemaining} lot`,
      };
    }

    if (type === "RECOMMEND_OPEN") {
      let side: Side;
      try {
        side = normalizeSide(decision.suggested_side);
      } catch {
        return { ok: false, message: "Önerilen yön (suggested_side) eksik veya geçersiz" };
      }

      const { data: existing } = await supabase
        .from("positions")
        .select("id")
        .eq("symbol", decision.symbol)
        .eq("status", "OPEN")
        .limit(1)
        .maybeSingle();

      if (existing) {
        return { ok: false, message: `${decision.symbol} için zaten açık pozisyon var` };
      }

      const { count } = await supabase
        .from("positions")
        .select("id", { count: "exact", head: true })
        .eq("status", "OPEN");

      if ((count ?? 0) >= MAX_OPEN_POSITIONS) {
        return { ok: false, message: `Maksimum açık pozisyon limiti dolu (${count}/${MAX_OPEN_POSITIONS})` };
      }

      const { data: live } = await supabase
        .from("live_prices")
        .select("last_price,atr")
        .eq("symbol", decision.symbol)
        .maybeSingle();

      const price =
        toNumber(live?.last_price, null) ?? toNumber(decision.suggested_price, null);

      if (!price || price <= 0) {
        return { ok: false, message: `${decision.symbol} için geçerli fiyat bulunamadı` };
      }

      const suggestedQty = Math.floor(toNumber(decision.suggested_qty, 0) ?? 0);
      const quantity = suggestedQty > 0 ? suggestedQty : calculateSizing(price).quantity;
      const risk = calculateRiskLevels(side, price, toNumber(live?.atr, null));

      await openPosition({
        symbol: decision.symbol,
        side,
        price,
        quantity,
        risk,
        strategyTag: "AI_AGENT",
        timeframe: "-",
        sector: getStaticSector(decision.symbol),
        rawPayload: { source: "ai_decision", decisionId: decision.id, trigger },
      });

      return { ok: true, message: `${decision.symbol} ${side} ${quantity} lot @ ${price} açıldı` };
    }

    return { ok: false, message: `Bilinmeyen karar tipi: ${type}` };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, message: msg };
  }
}
