"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import type {
  BrokerBridgeStatus,
  PositionLifecycle,
  SignalSide,
  SignalStatus,
  Trade,
  TradingSignal,
} from "./types";

type SourceMode = "SUPABASE" | "MOCK";
type Side = "LONG" | "SHORT";

type DbSignal = Record<string, any>;
type DbPosition = Record<string, any>;
type DbPositionEvent = Record<string, any>;
type DbExecutionEvent = Record<string, any>;
type DbLivePrice = Record<string, any>;

export type GlobalMarketItem = {
  symbol: string;
  price: number;
  changePct: number;
};

export type LivePrice = {
  symbol: string;
  bid: number | null;
  ask: number | null;
  volume: number | null;
  lastPrice: number | null;
  lastTradeTime: string | null;
  updatedAt: string | null;
  source: string;
  delayNote: string | null;
  isStale: boolean;
};

export type IntelligenceStats = {
  openPnlAmount: number;
  realizedPnlAmount: number;
  totalPnlAmount: number;
  openPositions: number;
  closedPositions: number;
  longCount: number;
  shortCount: number;
  winRate: number;
  exposurePct: number;
  livePriceCount: number;
  stalePriceCount: number;
};

const ACCOUNT_CAPITAL = 100_000;
const MAX_OPEN_POSITIONS = 10;
const POSITION_BUDGET = 10_000;
const STOP_LOSS_PCT = 3;
const TP1_PCT = 6;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export function useTradingIntelligence() {
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<SourceMode>(
    supabase ? "SUPABASE" : "MOCK"
  );

  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [positions, setPositions] = useState<PositionLifecycle[]>([]);
  const [allPositions, setAllPositions] = useState<PositionLifecycle[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [positionEvents, setPositionEvents] = useState<DbPositionEvent[]>([]);
  const [executionEvents, setExecutionEvents] = useState<DbExecutionEvent[]>([]);
  const [livePrices, setLivePrices] = useState<LivePrice[]>([]);
  const [globalContext, setGlobalContext] = useState<GlobalMarketItem[]>([]);

  const livePriceMap = useMemo(() => {
    const map = new Map<string, LivePrice>();
    livePrices.forEach((item) => map.set(item.symbol, item));
    return map;
  }, [livePrices]);

  const loadGlobalContext = useCallback(async () => {
    try {
      const response = await fetch("/api/global-context", { cache: "no-store" });
      const json = await response.json();
      if (!json?.ok) return;

      const raw = json?.data?.data ?? json?.data?.result ?? json?.data ?? [];
      const list = Array.isArray(raw) ? raw : Object.values(raw ?? {});

      const mapped = list
        .map((item: any) => ({
          symbol: String(item.symbol ?? item.ticker ?? item.name ?? "N/A"),
          price: num(item.price ?? item.lastPrice ?? item.close ?? item.value, 0),
          changePct: num(
            item.dailyChange ??
              item.changePercent ??
              item.changePct ??
              item.change ??
              item.percentChange,
            0
          ),
        }))
        .filter((item) => item.symbol !== "N/A");

      setGlobalContext(mapped);
    } catch {
      setGlobalContext([]);
    }
  }, []);

  const loadAll = useCallback(async () => {
    if (!supabase) {
      setSource("MOCK");
      setSignals([createSignalFallback()]);
      setPositions([]);
      setAllPositions([]);
      setTrades([]);
      setPositionEvents([]);
      setExecutionEvents([]);
      setLivePrices([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [
        signalsResult,
        positionsResult,
        positionEventsResult,
        executionEventsResult,
        livePricesResult,
      ] = await Promise.all([
        supabase
          .from("signals")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(80),

        supabase
          .from("positions")
          .select("*")
          .order("opened_at", { ascending: false })
          .limit(250),

        supabase
          .from("position_events")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(150),

        supabase
          .from("execution_events")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(150),

        supabase
          .from("live_prices")
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(1000),
      ]);

      const dbSignals = signalsResult.error ? [] : signalsResult.data ?? [];
      const dbPositions = positionsResult.error ? [] : positionsResult.data ?? [];
      const dbPositionEvents = positionEventsResult.error
        ? []
        : positionEventsResult.data ?? [];
      const dbExecutionEvents = executionEventsResult.error
        ? []
        : executionEventsResult.data ?? [];
      const dbLivePrices = livePricesResult.error ? [] : livePricesResult.data ?? [];

      const mappedLivePrices = mapLivePrices(dbLivePrices as DbLivePrice[]);
      const liveMap = createLiveMap(mappedLivePrices);
      const mappedSignals = mapSignals(dbSignals as DbSignal[]);
      const eventSignals = mapExecutionEventsToSignals(
        dbExecutionEvents as DbExecutionEvent[]
      );
      const mappedPositions = mapPositions(dbPositions as DbPosition[], liveMap);
      const mappedTrades = mapTrades(dbPositions as DbPosition[], liveMap);

      setSource("SUPABASE");
      setSignals(dedupeSignals([...mappedSignals, ...eventSignals]));
      setLivePrices(mappedLivePrices);
      setAllPositions(mappedPositions);
      setPositions(mappedPositions.filter((item: any) => item.rawStatus === "OPEN"));
      setTrades(mappedTrades);
      setPositionEvents(dbPositionEvents as DbPositionEvent[]);
      setExecutionEvents(dbExecutionEvents as DbExecutionEvent[]);
    } catch {
      setSource(supabase ? "SUPABASE" : "MOCK");
      setSignals(supabase ? [] : [createSignalFallback()]);
      setPositions([]);
      setAllPositions([]);
      setTrades([]);
      setPositionEvents([]);
      setExecutionEvents([]);
      setLivePrices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    loadGlobalContext();

    if (!supabase) return;

    const channel = supabase
      .channel("trading-intelligence-live-prices-v2")
      .on("postgres_changes", { event: "*", schema: "public", table: "signals" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "positions" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "position_events" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "execution_events" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "live_prices" }, () => loadAll())
      .subscribe();

    const poll = window.setInterval(() => {
      loadAll();
      loadGlobalContext();
    }, 10000);

    return () => {
      window.clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [loadAll, loadGlobalContext]);

  const stats: IntelligenceStats = useMemo(() => {
    const openTrades = trades.filter(isOpenTrade);
    const closedTrades = trades.filter(isClosedTrade);

    const openPnlAmount = openTrades.reduce(
      (sum, trade: any) => sum + num(trade.pnlAmount, 0),
      0
    );
    const realizedPnlAmount = closedTrades.reduce(
      (sum, trade: any) => sum + num(trade.pnlAmount, 0),
      0
    );
    const winners = closedTrades.filter((trade: any) => num(trade.pnlAmount, 0) > 0).length;
    const winRate = closedTrades.length ? Math.round((winners / closedTrades.length) * 100) : 0;
    const longCount = openTrades.filter((trade) => trade.side === "LONG").length;
    const shortCount = openTrades.filter((trade) => trade.side === "SHORT").length;

    return {
      openPnlAmount,
      realizedPnlAmount,
      totalPnlAmount: openPnlAmount + realizedPnlAmount,
      openPositions: openTrades.length,
      closedPositions: closedTrades.length,
      longCount,
      shortCount,
      winRate,
      exposurePct: Math.min(100, Math.round((openTrades.length / MAX_OPEN_POSITIONS) * 100)),
      livePriceCount: livePrices.length,
      stalePriceCount: livePrices.filter((item) => item.isStale).length,
    };
  }, [trades, livePrices]);

  const bridge: BrokerBridgeStatus = useMemo(
    () => ({
      health: livePrices.length > 0 ? "OK" : "WARN",
      mode: "PAPER",
      lastAction:
        executionEvents[0]?.event_type ??
        positionEvents[0]?.event_type ??
        "Waiting for signal",
      latencyMs: 0,
    }),
    [executionEvents, positionEvents, livePrices.length]
  );

  return {
    loading,
    source,
    signals,
    positions,
    allPositions,
    trades,
    positionEvents,
    executionEvents,
    livePrices,
    livePriceMap,
    globalContext,
    stats,
    bridge,
    accountCapital: ACCOUNT_CAPITAL,
    maxOpenPositions: MAX_OPEN_POSITIONS,
    positionBudget: POSITION_BUDGET,
    refresh: loadAll,
    refreshGlobalContext: loadGlobalContext,
  };
}

function mapLivePrices(rows: DbLivePrice[]): LivePrice[] {
  return rows.map((row) => {
    const updatedAt = row.updated_at ? String(row.updated_at) : null;
    const lastTradeTime = row.last_trade_time ? String(row.last_trade_time) : null;
    const ageMs = updatedAt ? Date.now() - new Date(updatedAt).getTime() : Infinity;

    return {
      symbol: cleanSymbol(row.symbol),
      bid: nullablePositiveNum(row.bid),
      ask: nullablePositiveNum(row.ask),
      volume: nullablePositiveNum(row.volume ?? row.volume_tl),
      lastPrice: nullablePositiveNum(row.last_price ?? row.price),
      lastTradeTime,
      updatedAt,
      source: String(row.source ?? "MATRIKS_DDE"),
      delayNote: row.delay_note ? String(row.delay_note) : null,
      isStale: Boolean(row.is_stale) || ageMs > 90_000,
    };
  });
}

function createLiveMap(rows: LivePrice[]) {
  const map = new Map<string, LivePrice>();
  rows.forEach((row) => map.set(row.symbol, row));
  return map;
}

function mapSignals(rows: DbSignal[]): TradingSignal[] {
  return rows.map((row, index) =>
    createTradingSignal({
      id: String(row.id ?? `signal-${index}`),
      symbol: cleanSymbol(row.symbol ?? row.ticker ?? "UNKNOWN"),
      side: normalizeSide(row.side ?? row.order_action ?? row.orderSide),
      price: num(row.price ?? row.close, 0),
      status: normalizeSignalStatus(row.status ?? row.signal ?? row.event),
      created_at: str(row.created_at),
      rsi: nullableNum(row.rsi),
      macd: nullableNum(row.macd),
      atr: nullableNum(row.atr),
      distAtr: nullableNum(row.dist_atr ?? row.distAtr),
      score: nullableNum(row.quality_score ?? row.score) ?? 0,
      timeframe: String(row.timeframe ?? "-"),
      strategyTag: String(row.strategy_tag ?? row.strategyTag ?? "EMA100_PRO"),
    })
  );
}

function mapExecutionEventsToSignals(rows: DbExecutionEvent[]): TradingSignal[] {
  return rows
    .filter((row) => isSignalLikeEvent(row.event_type))
    .map((row, index) =>
      createTradingSignal({
        id: String(row.id ?? `execution-${index}`),
        symbol: cleanSymbol(row.symbol ?? "UNKNOWN"),
        side: normalizeSide(row.side ?? row.event_type),
        price: num(row.price, 0),
        status: "CONFIRMED" as SignalStatus,
        created_at: str(row.created_at),
        rsi: null,
        macd: null,
        atr: null,
        distAtr: null,
        score: nullableNum(row.quality_score) ?? 0,
        timeframe: String(row.timeframe ?? "-"),
        strategyTag: String(row.strategy_tag ?? "EMA100_PRO"),
      })
    );
}

function mapPositions(rows: DbPosition[], liveMap: Map<string, LivePrice>): PositionLifecycle[] {
  return rows.map((row) => {
    const statusRaw = String(row.status ?? "").toUpperCase();
    const side = normalizeSide(row.side) as Side;
    const symbol = cleanSymbol(row.symbol);
    const live = liveMap.get(symbol);
    const entry = num(row.entry_price, 0);
    const dbCurrent = num(row.current_price ?? row.entry_price, entry);
    const current = statusRaw === "OPEN"
      ? live?.lastPrice ?? dbCurrent
      : num(row.exit_price ?? row.close_price ?? dbCurrent, dbCurrent);
    const quantity = num(row.quantity, 1) || 1;
    const pnlPct = statusRaw === "CLOSED" && row.pnl_pct !== null && row.pnl_pct !== undefined
      ? num(row.pnl_pct, 0)
      : calcPnlPct(side, entry, current);
    const pnlAmount = statusRaw === "CLOSED" && row.pnl_amount !== null && row.pnl_amount !== undefined
      ? num(row.pnl_amount, 0)
      : calcPnlAmount(side, entry, current, quantity);

    return createPositionLifecycle({
      id: String(row.id),
      symbol,
      side,
      entry,
      current,
      stop: num(row.trailing_stop_price ?? row.stop_price ?? row.sl_price, 0),
      takeProfit: num(row.tp1_price ?? row.tp_price, 0),
      pnlPct,
      pnlAmount,
      quantity,
      remainingQuantity: num(row.remaining_quantity, quantity),
      realizedPartialAmount: num(row.realized_partial_amount, 0),
      trailingStage: String(row.trailing_stage ?? "INITIAL"),
      tp1Hit: Boolean(row.tp1_hit),
      tp1Price: num(row.tp1_price ?? row.tp_price, 0),
      stopPrice: num(row.trailing_stop_price ?? row.stop_price ?? row.sl_price, 0),
      allocatedAmount: num(row.allocated_amount ?? row.notional, entry * quantity),
      aiScore: num(row.quality_score, 0),
      strategy: String(row.strategy_tag ?? "EMA100_PRO"),
      timeframe: String(row.timeframe ?? "-"),
      openedAt: str(row.opened_at ?? row.created_at),
      closedAt: row.closed_at ? String(row.closed_at) : null,
      closeReason: row.close_reason ? String(row.close_reason) : null,
      status: statusRaw,
      rawStatus: statusRaw,
      reversalReady: false,
      livePrice: live,
      liveSource: live?.lastPrice ? live.source : "POSITIONS",
      liveUpdatedAt: live?.updatedAt ?? null,
    });
  });
}

function mapTrades(rows: DbPosition[], liveMap: Map<string, LivePrice>): Trade[] {
  return rows.map((row) => {
    const side = normalizeSide(row.side) as Side;
    const symbol = cleanSymbol(row.symbol);
    const statusRaw = String(row.status ?? "").toUpperCase();
    const live = liveMap.get(symbol);
    const entry = num(row.entry_price, 0);
    const fallbackCurrent = num(row.current_price ?? row.entry_price, entry);
    const current = statusRaw === "OPEN"
      ? live?.lastPrice ?? fallbackCurrent
      : num(row.exit_price ?? row.close_price ?? fallbackCurrent, fallbackCurrent);
    const quantity = num(row.quantity, 1) || 1;
    const pnlPct = statusRaw === "CLOSED" && row.pnl_pct !== null && row.pnl_pct !== undefined
      ? num(row.pnl_pct, 0)
      : calcPnlPct(side, entry, current);
    const pnlAmount = statusRaw === "CLOSED" && row.pnl_amount !== null && row.pnl_amount !== undefined
      ? num(row.pnl_amount, 0)
      : calcPnlAmount(side, entry, current, quantity);

    return createTrade({
      id: String(row.id),
      symbol,
      side,
      entry,
      current,
      exit: current,
      stop: num(row.trailing_stop_price ?? row.stop_price ?? row.sl_price, 0),
      takeProfit: num(row.tp1_price ?? row.tp_price, 0),
      pnl: pnlPct,
      pnlAmount,
      quantity,
      remainingQuantity: num(row.remaining_quantity, quantity),
      realizedPartialAmount: num(row.realized_partial_amount, 0),
      trailingStage: String(row.trailing_stage ?? "INITIAL"),
      tp1Hit: Boolean(row.tp1_hit),
      tp1Price: num(row.tp1_price ?? row.tp_price, 0),
      stopPrice: num(row.trailing_stop_price ?? row.stop_price ?? row.sl_price, 0),
      allocatedAmount: num(row.allocated_amount ?? row.notional, entry * quantity),
      createdAt: str(row.created_at ?? row.opened_at),
      closedAt: row.closed_at ? String(row.closed_at) : undefined,
      status: statusRaw,
      rawStatus: statusRaw,
      strategy: String(row.strategy_tag ?? "EMA100_PRO"),
      confidence: num(row.quality_score, 0),
      time: str(row.closed_at ?? row.created_at ?? row.opened_at),
      livePrice: live,
      liveSource: live?.lastPrice ? live.source : "POSITIONS",
      liveUpdatedAt: live?.updatedAt ?? null,
    });
  });
}

function createTradingSignal(input: Record<string, any>): TradingSignal {
  return { ...input, createdAt: input.created_at } as unknown as TradingSignal;
}
function createPositionLifecycle(input: Record<string, any>): PositionLifecycle {
  return input as unknown as PositionLifecycle;
}
function createTrade(input: Record<string, any>): Trade {
  return input as unknown as Trade;
}
function createSignalFallback(): TradingSignal {
  return createTradingSignal({
    id: "waiting-signal",
    symbol: "WAITING",
    side: "LONG" as SignalSide,
    price: 0,
    status: "WAIT" as SignalStatus,
    created_at: new Date().toISOString(),
    rsi: null,
    macd: null,
    atr: null,
    distAtr: null,
    score: 0,
    timeframe: "-",
    strategyTag: "NO_SUPABASE_CONNECTION",
  });
}
function dedupeSignals(rows: TradingSignal[]): TradingSignal[] {
  const seen = new Set<string>();
  return rows
    .sort((a: any, b: any) => new Date(b.created_at ?? b.createdAt ?? 0).getTime() - new Date(a.created_at ?? a.createdAt ?? 0).getTime())
    .filter((row: any) => {
      const key = `${row.id}-${row.symbol}-${row.side}-${row.created_at ?? row.createdAt}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 80);
}
function isSignalLikeEvent(eventType: unknown) {
  const raw = String(eventType ?? "").toUpperCase();
  return raw.includes("CONFIRMED") || raw.includes("POSITION_OPENED") || raw.includes("REVERSAL_OPEN") || raw.includes("TAKE_PROFIT") || raw.includes("STOP_LOSS");
}
function isOpenTrade(trade: any) {
  return String(trade?.rawStatus ?? trade?.status ?? "").toUpperCase() === "OPEN";
}
function isClosedTrade(trade: any) {
  return String(trade?.rawStatus ?? trade?.status ?? "").toUpperCase() === "CLOSED";
}
function normalizeSide(value: unknown): SignalSide {
  const raw = String(value ?? "").toUpperCase();
  if (raw === "BUY" || raw === "LONG" || raw.includes("BUY") || raw.includes("LONG")) return "LONG" as SignalSide;
  if (raw === "SELL" || raw === "SHORT" || raw.includes("SELL") || raw.includes("SHORT")) return "SHORT" as SignalSide;
  return "LONG" as SignalSide;
}
function normalizeSignalStatus(value: unknown): SignalStatus {
  const raw = String(value ?? "").toUpperCase();
  if (raw.includes("WATCH")) return "WATCH" as SignalStatus;
  if (raw.includes("WAIT")) return "WAIT" as SignalStatus;
  return "CONFIRMED" as SignalStatus;
}
function cleanSymbol(value: unknown) {
  return String(value ?? "UNKNOWN").replace("BIST:", "").replace("BIST.", "").toUpperCase().trim();
}
function str(value: unknown) {
  return value ? String(value) : new Date().toISOString();
}
function num(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function nullableNum(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function nullablePositiveNum(value: unknown) {
  const parsed = nullableNum(value);
  if (parsed === null || parsed <= 0) return null;
  return parsed;
}
function calcPnlPct(side: Side, entry: number, current: number) {
  if (!entry || !current) return 0;
  return side === "LONG" ? ((current - entry) / entry) * 100 : ((entry - current) / entry) * 100;
}
function calcPnlAmount(side: Side, entry: number, current: number, quantity: number) {
  if (!entry || !current) return 0;
  return side === "LONG" ? (current - entry) * quantity : (entry - current) * quantity;
}
