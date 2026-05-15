import type { RawSignal, Trade } from "./types";

export function num(v: unknown, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

export function normalizeSide(s: RawSignal): Trade["side"] {
  const raw = String(s.side || s.order_side || s.order_action || "").toUpperCase();

  if (raw.includes("BUY") || raw.includes("LONG")) return "LONG";
  if (raw.includes("SELL") || raw.includes("SHORT")) return "SHORT";

  return "UNKNOWN";
}

export function normalizeSignal(s: RawSignal): Trade {
  return {
    id: s.id,
    symbol: s.symbol || s.ticker || "UNKNOWN",
    side: normalizeSide(s),
    strategy: s.strategy || "EMA100 CORE",
    status: s.status || "OPEN",
    price: num(s.current_price || s.price || s.close || s.entry_price),
    pnl: num(s.pnl),
    stopLoss: num(s.stop_loss),
    takeProfit: num(s.take_profit),
    confidence: num(s.confidence, 72),
    riskScore: num(s.risk_score, 38),
    distAtr: num(s.dist_atr),
    rsi: num(s.rsi),
    createdAt: s.created_at || new Date().toISOString(),
  };
}

export function money(v: number) {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

export function shortTime(v: string) {
  return new Date(v).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function groupByPnl(rows: Trade[], key: "symbol" | "strategy") {
  const map = new Map<string, number>();

  rows.forEach((r) => {
    map.set(r[key], (map.get(r[key]) || 0) + r.pnl);
  });

  return Array.from(map.entries())
    .map(([name, pnl]) => ({ name, pnl }))
    .sort((a, b) => b.pnl - a.pnl);
}