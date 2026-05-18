export type Tone =
  | "good"
  | "bad"
  | "warn"
  | "neutral"
  | "cyan"
  | "emerald"
  | "red"
  | "amber"
  | "blue"
  | "purple"
  | "zinc"
  | "slate";

export type SignalSide = "LONG" | "SHORT" | "FLAT";

export type SignalStatus =
  | "OPEN"
  | "CLOSED"
  | "TP"
  | "SL"
  | "TRAILING"
  | "WAIT";

export type Trade = {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT";
  strategy: string;
  pnl: number;
  confidence: number;
  entry: number;
  price?: number;
  stop?: number | null;
  takeProfit?: number | null;
  time: string;
  createdAt: string;
  status: SignalStatus;
};

export type TradingSignal = {
  id: string;
  symbol: string;
  side: SignalSide;
  price: number;
  status: SignalStatus;
  created_at: string;

  rsi?: number | null;
  macd?: number | null;
  atr?: number | null;
  distAtr?: number | null;
  emaSlope?: number | null;

  pnl?: number | null;
  pnlPct?: number | null;
  score?: number | null;
  sector?: string | null;
};

export type SignalRow = {
  id: string;
  symbol?: string | null;
  ticker?: string | null;
  side?: string | null;
  order_side?: string | null;
  price?: number | null;
  close?: number | null;
  status?: string | null;
  strategy?: string | null;
  created_at?: string | null;

  rsi?: number | null;
  macd?: number | null;
  atr?: number | null;
  distatr?: number | null;
  dist_atr?: number | null;
  ema_slope?: number | null;
  score?: number | null;
};

export type PositionLifecycle = {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT";
  entry: number;
  current: number;
  stop: number;
  takeProfit: number;
  pnlPct: number;
  status: SignalStatus;
  openedAt: string;
  strategy: string;
  aiScore: number;
  reversalReady: boolean;
};

export type BrokerBridgeStatus = {
  mode: "PAPER" | "LIVE_READY" | "DISABLED";
  lastAction: string;
  health: "OK" | "WARN" | "ERROR";
};