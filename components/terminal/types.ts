export type SignalSide = "LONG" | "SHORT" | "FLAT";

export type SignalStatus =
  | "OPEN"
  | "CLOSED"
  | "TP"
  | "SL"
  | "TRAILING"
  | "WAIT";

export type Trade = {
  symbol: string;
  side: "LONG" | "SHORT";
  strategy: string;
  pnl: number;
  confidence: number;
  entry: number;
  time: string;
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