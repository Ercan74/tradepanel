export type RawSignal = {
  id: string;
  created_at?: string;
  symbol?: string;
  ticker?: string;
  side?: string;
  order_side?: string;
  order_action?: string;
  strategy?: string;
  status?: string;
  price?: number;
  close?: number;
  entry_price?: number;
  current_price?: number;
  pnl?: number;
  stop_loss?: number;
  take_profit?: number;
  confidence?: number;
  risk_score?: number;
  dist_atr?: number;
  rsi?: number;
};

export type Trade = {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT" | "UNKNOWN";
  strategy: string;
  status: string;
  price: number;
  pnl: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  riskScore: number;
  distAtr: number;
  rsi: number;
  createdAt: string;
};

export type Tone = "good" | "bad" | "warn" | "neutral";