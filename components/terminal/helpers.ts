import { TradingSignal } from "./types";

export function money(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";

  return `${value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₺`;
}

export function shortTime(value?: string | null) {
  if (!value) return "-";

  if (value.includes("T")) {
    return value.slice(11, 16);
  }

  if (value.length >= 16) {
    return value.slice(11, 16);
  }

  return value;
}

export function formatPrice(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";

  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatPct(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function pnlColor(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "text-zinc-400";
  }

  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-red-400";

  return "text-zinc-400";
}

export function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function getSignalScore(signal: TradingSignal) {
  const rsi = signal.rsi ?? 50;
  const distAtr = Math.abs(signal.distAtr ?? 0);
  const slope = Math.abs(signal.emaSlope ?? 0);
  const macd = Math.abs(signal.macd ?? 0);

  const base =
    40 +
    clamp(distAtr * 10, 0, 25) +
    clamp(slope * 12, 0, 20) +
    clamp(macd * 8, 0, 15);

  const rsiPenalty =
    rsi > 80 || rsi < 20 ? 18 : rsi > 70 || rsi < 30 ? 8 : 0;

  return clamp(Math.round(base - rsiPenalty), 0, 100);
}

export function getRiskLevel(signal: TradingSignal) {
  const rsi = signal.rsi ?? 50;
  const distAtr = Math.abs(signal.distAtr ?? 0);
  const slope = Math.abs(signal.emaSlope ?? 0);

  const risk = distAtr * 18 + slope * 15 + (rsi > 75 || rsi < 25 ? 25 : 0);

  if (risk >= 75) return "HIGH";
  if (risk >= 45) return "MEDIUM";
  return "LOW";
}

export function getSideClass(side?: string) {
  if (side === "LONG") return "text-emerald-400";
  if (side === "SHORT") return "text-red-400";
  return "text-zinc-400";
}

export function getRiskClass(risk: string) {
  if (risk === "HIGH") return "bg-red-500/15 text-red-300 border-red-500/30";

  if (risk === "MEDIUM") {
    return "bg-amber-500/15 text-amber-300 border-amber-500/30";
  }

  return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
}