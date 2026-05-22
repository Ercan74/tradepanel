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
  const [trades, setTrades] = useState<Trade[]>([]);
  const [positionEvents, setPositionEvents] = useState<DbPositionEvent[]>([]);
  const [executionEvents, setExecutionEvents] = useState<DbExecutionEvent[]>([]);

  const loadAll = useCallback(async () => {
    if (!supabase) {
      setSource("MOCK");
      setSignals([createSignalFallback()]);
      setPositions([]);
      setTrades([]);
      setPositionEvents([]);
      setExecutionEvents([]);
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
          .limit(150),

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
      ]);

      const dbSignals = signalsResult.error ? [] : signalsResult.data ?? [];
      const dbPositions = positionsResult.error ? [] : positionsResult.data ?? [];
      const dbPositionEvents = positionEventsResult.error
        ? []
        : positionEventsResult.data ?? [];
      const dbExecutionEvents = executionEventsResult.error
        ? []
        : executionEventsResult.data ?? [];

      const mappedSignals = mapSignals(dbSignals as DbSignal[]);
      const eventSignals = mapExecutionEventsToSignals(
        dbExecutionEvents as DbExecutionEvent[]
      );

      setSource("SUPABASE");
      setSignals(dedupeSignals([...mappedSignals, ...eventSignals]));
      setPositions(mapPositions(dbPositions as DbPosition[]));
      setTrades(mapTrades(dbPositions as DbPosition[]));
      setPositionEvents(dbPositionEvents as DbPositionEvent[]);
      setExecutionEvents(dbExecutionEvents as DbExecutionEvent[]);
    } catch {
      setSource(supabase ? "SUPABASE" : "MOCK");
      setSignals(supabase ? [] : [createSignalFallback()]);
      setPositions([]);
      setTrades([]);
      setPositionEvents([]);
      setExecutionEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();

    if (!supabase) return;

    const channel = supabase
      .channel("trading-intelligence-realtime-final")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "signals" },
        () => loadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "positions" },
        () => loadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "position_events" },
        () => loadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "execution_events" },
        () => loadAll()
      )
      .subscribe();

    const poll = window.setInterval(loadAll, 15000);

    return () => {
      window.clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [loadAll]);

  const bridge: BrokerBridgeStatus = useMemo(
    () => ({
      health: "OK",
      mode: "PAPER",
      lastAction:
        executionEvents[0]?.event_type ??
        positionEvents[0]?.event_type ??
        "Waiting for signal",
      latencyMs: 0,
    }),
    [executionEvents, positionEvents]
  );

  return {
    loading,
    source,
    signals,
    positions,
    allPositions: positions,
    trades,
    positionEvents,
    executionEvents,
    bridge,
    refresh: loadAll,
  };
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
        timeframe: "-",
        strategyTag: String(row.strategy_tag ?? "EMA100_PRO"),
      })
    );
}

function mapPositions(rows: DbPosition[]): PositionLifecycle[] {
  return rows
    .filter((row) => String(row.status ?? "").toUpperCase() === "OPEN")
    .map((row) => {
      const side = normalizeSide(row.side) as Side;
      const entry = num(row.entry_price, 0);
      const current = num(row.current_price ?? row.entry_price, entry);
      const pnlPct =
        row.pnl_pct !== null && row.pnl_pct !== undefined
          ? num(row.pnl_pct, 0)
          : calcPnlPct(side, entry, current);

      return createPositionLifecycle({
        id: String(row.id),
        symbol: cleanSymbol(row.symbol),
        side,
        entry,
        current,
        stop: num(row.sl_price, 0),
        takeProfit: num(row.tp_price, 0),
        pnlPct,
        aiScore: num(row.quality_score, 0),
        strategy: String(row.strategy_tag ?? "EMA100_PRO"),
        openedAt: str(row.opened_at ?? row.created_at),
        reversalReady: false,
        status: normalizeSignalStatus(row.status),
      });
    });
}

function mapTrades(rows: DbPosition[]): Trade[] {
  return rows.map((row) => {
    const side = normalizeSide(row.side) as Side;
    const entry = num(row.entry_price, 0);
    const exit = num(row.exit_price ?? row.current_price ?? row.entry_price, entry);
    const pnlPct =
      row.pnl_pct !== null && row.pnl_pct !== undefined
        ? num(row.pnl_pct, 0)
        : calcPnlPct(side, entry, exit);

    return createTrade({
      id: String(row.id),
      symbol: cleanSymbol(row.symbol),
      side,
      entry,
      exit,
      stop: num(row.sl_price, 0),
      takeProfit: num(row.tp_price, 0),
      pnl: pnlPct,
      createdAt: str(row.created_at ?? row.opened_at),
      closedAt: row.closed_at ? String(row.closed_at) : undefined,
      status: normalizeSignalStatus(row.status),
      strategy: String(row.strategy_tag ?? "EMA100_PRO"),
      confidence: num(row.quality_score, 0),
      time: str(row.closed_at ?? row.created_at ?? row.opened_at),
    });
  });
}

function createTradingSignal(input: Record<string, any>): TradingSignal {
  return {
    ...input,
    createdAt: input.created_at,
  } as unknown as TradingSignal;
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
    .sort((a: any, b: any) => {
      const bTime = new Date(b.created_at ?? b.createdAt ?? 0).getTime();
      const aTime = new Date(a.created_at ?? a.createdAt ?? 0).getTime();
      return bTime - aTime;
    })
    .filter((row: any) => {
      const key = `${row.id}-${row.symbol}-${row.side}-${
        row.created_at ?? row.createdAt
      }`;

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 80);
}

function isSignalLikeEvent(eventType: unknown) {
  const raw = String(eventType ?? "").toUpperCase();

  return (
    raw.includes("CONFIRMED") ||
    raw.includes("POSITION_OPENED") ||
    raw.includes("REVERSAL_OPEN") ||
    raw.includes("TAKE_PROFIT") ||
    raw.includes("STOP_LOSS")
  );
}

function normalizeSide(value: unknown): SignalSide {
  const raw = String(value ?? "").toUpperCase();

  if (
    raw === "BUY" ||
    raw === "LONG" ||
    raw.includes("BUY") ||
    raw.includes("LONG")
  ) {
    return "LONG" as SignalSide;
  }

  if (
    raw === "SELL" ||
    raw === "SHORT" ||
    raw.includes("SELL") ||
    raw.includes("SHORT")
  ) {
    return "SHORT" as SignalSide;
  }

  return "LONG" as SignalSide;
}

function normalizeSignalStatus(value: unknown): SignalStatus {
  const raw = String(value ?? "").toUpperCase();

  if (raw.includes("WATCH")) return "WATCH" as SignalStatus;
  if (raw.includes("WAIT")) return "WAIT" as SignalStatus;

  return "CONFIRMED" as SignalStatus;
}

function cleanSymbol(value: unknown) {
  return String(value ?? "UNKNOWN").replace("BIST:", "").toUpperCase();
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

function calcPnlPct(side: Side, entry: number, current: number) {
  if (!entry || !current) return 0;

  if (side === "LONG") {
    return ((current - entry) / entry) * 100;
  }

  return ((entry - current) / entry) * 100;
}