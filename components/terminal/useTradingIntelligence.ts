"use client";

import { useEffect, useMemo, useState } from "react";
import { hasSupabaseEnv, supabase } from "@/lib/supabase";
import type {
  BrokerBridgeStatus,
  PositionLifecycle,
  SignalRow,
  SignalSide,
  SignalStatus,
  Trade,
  TradingSignal,
} from "./types";

function normalizeSide(value?: string | null): SignalSide {
  const side = String(value ?? "").toUpperCase();

  if (side === "BUY" || side === "LONG") return "LONG";
  if (side === "SELL" || side === "SHORT") return "SHORT";

  return "FLAT";
}

function normalizeStatus(value?: string | null): SignalStatus {
  const status = String(value ?? "OPEN").toUpperCase();

  if (
    status === "OPEN" ||
    status === "CLOSED" ||
    status === "TP" ||
    status === "SL" ||
    status === "TRAILING" ||
    status === "WAIT"
  ) {
    return status;
  }

  return "OPEN";
}

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function calcAiScore(signal: TradingSignal) {
  const rsi = signal.rsi ?? 50;
  const dist = Math.abs(signal.distAtr ?? 1);
  const slope = Math.abs(signal.emaSlope ?? 0.5);
  const macd = Math.abs(signal.macd ?? 0.5);

  const base = 50 + dist * 8 + slope * 10 + macd * 6;
  const penalty = rsi > 78 || rsi < 22 ? 12 : rsi > 70 || rsi < 30 ? 6 : 0;

  return Math.max(0, Math.min(100, Math.round(base - penalty)));
}

function rowToSignal(row: SignalRow): TradingSignal {
  const side = normalizeSide(row.side ?? row.order_side);
  const createdAt = row.created_at ?? new Date().toISOString();

  return {
    id: String(row.id ?? crypto.randomUUID()),
    symbol: row.symbol ?? row.ticker ?? "UNKNOWN",
    side,
    price: safeNumber(row.price ?? row.close, 0),
    status: normalizeStatus(row.status),
    created_at: createdAt,

    rsi: row.rsi ?? null,
    macd: row.macd ?? null,
    atr: row.atr ?? null,
    distAtr: row.dist_atr ?? row.distatr ?? null,
    emaSlope: row.ema_slope ?? null,
    score: row.score ?? null,
  };
}

function signalToTrade(signal: TradingSignal): Trade {
  const score = signal.score ?? calcAiScore(signal);
  const side = signal.side === "SHORT" ? "SHORT" : "LONG";
  const price = signal.price || 1;

  return {
    id: signal.id,
    symbol: signal.symbol,
    side,
    strategy: "EMA100 LIVE",
    pnl: signal.pnlPct ?? 0,
    confidence: score,
    entry: price,
    price,
    stop: side === "LONG" ? price * 0.98 : price * 1.02,
    takeProfit: side === "LONG" ? price * 1.04 : price * 0.96,
    time: signal.created_at.slice(0, 10),
    createdAt: signal.created_at,
    status: signal.status,
  };
}

function buildLifecycle(trades: Trade[]): PositionLifecycle[] {
  return trades.map((trade) => {
    const current = trade.price ?? trade.entry;
    const stop =
      trade.stop ??
      (trade.side === "LONG" ? trade.entry * 0.98 : trade.entry * 1.02);
    const takeProfit =
      trade.takeProfit ??
      (trade.side === "LONG" ? trade.entry * 1.04 : trade.entry * 0.96);

    const pnlPct =
      trade.side === "LONG"
        ? ((current - trade.entry) / trade.entry) * 100
        : ((trade.entry - current) / trade.entry) * 100;

    return {
      id: trade.id,
      symbol: trade.symbol,
      side: trade.side,
      entry: trade.entry,
      current,
      stop,
      takeProfit,
      pnlPct,
      status: trade.status,
      openedAt: trade.createdAt,
      strategy: trade.strategy,
      aiScore: trade.confidence,
      reversalReady: pnlPct < -1.5,
    };
  });
}

const mockSignals: TradingSignal[] = [
  {
    id: "1",
    symbol: "AFYON",
    side: "LONG",
    price: 13.25,
    status: "OPEN",
    created_at: "2026-05-13T16:35:00",
    rsi: 54,
    macd: 1.2,
    atr: 2.1,
    distAtr: 1.4,
    emaSlope: 0.8,
    score: 72,
  },
  {
    id: "2",
    symbol: "ASELS",
    side: "SHORT",
    price: 74.15,
    status: "OPEN",
    created_at: "2026-05-13T16:40:00",
    rsi: 68,
    macd: 0.9,
    atr: 2.4,
    distAtr: 1.7,
    emaSlope: 0.9,
    score: 86,
  },
  {
    id: "3",
    symbol: "EKGYO",
    side: "LONG",
    price: 11.82,
    status: "OPEN",
    created_at: "2026-05-13T16:45:00",
    rsi: 61,
    macd: 0.7,
    atr: 2.7,
    distAtr: 2.1,
    emaSlope: 1.1,
    score: 79,
  },
  {
    id: "4",
    symbol: "SASA",
    side: "SHORT",
    price: 43.92,
    status: "OPEN",
    created_at: "2026-05-13T16:50:00",
    rsi: 72,
    macd: 0.4,
    atr: 3.1,
    distAtr: 2.4,
    emaSlope: 1.2,
    score: 68,
  },
];

export function useTradingIntelligence() {
  const [signals, setSignals] = useState<TradingSignal[]>(mockSignals);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"SUPABASE" | "MOCK">("MOCK");
  const [bridge, setBridge] = useState<BrokerBridgeStatus>({
    mode: "PAPER",
    lastAction: "Waiting for signal",
    health: "OK",
  });

  useEffect(() => {
    let active = true;

    async function loadSignals() {
      if (!hasSupabaseEnv || !supabase) {
        setSource("MOCK");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("signals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (!active) return;

      if (error || !data) {
        setSource("MOCK");
        setLoading(false);
        return;
      }

      setSignals(data.map(rowToSignal));
      setSource("SUPABASE");
      setLoading(false);
    }

    loadSignals();

    if (!hasSupabaseEnv || !supabase) return;

    const client = supabase;

    const channel = client
      .channel("signals-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "signals",
        },
        (payload) => {
          if (!payload.new) return;

          const next = rowToSignal(payload.new as SignalRow);

          setSignals((prev) => {
            const exists = prev.some((item) => item.id === next.id);

            if (exists) {
              return prev.map((item) => (item.id === next.id ? next : item));
            }

            return [next, ...prev].slice(0, 50);
          });

          setBridge({
            mode: "PAPER",
            lastAction: `${next.symbol} ${next.side} signal received`,
            health: "OK",
          });
        }
      )
      .subscribe();

    return () => {
      active = false;
      client.removeChannel(channel);
    };
  }, []);

  const rankedSignals = useMemo(() => {
    return [...signals]
      .map((signal) => ({
        ...signal,
        score: signal.score ?? calcAiScore(signal),
      }))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }, [signals]);

  const trades = useMemo(() => {
    return rankedSignals
      .filter((signal) => signal.side === "LONG" || signal.side === "SHORT")
      .map(signalToTrade);
  }, [rankedSignals]);

  const positions = useMemo(() => buildLifecycle(trades), [trades]);

  return {
    loading,
    source,
    signals: rankedSignals,
    trades,
    positions,
    bridge,
  };
}