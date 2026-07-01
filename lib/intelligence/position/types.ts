/**
 * TIOS Intelligence Engine — Position Module Types
 */

import { IntelligenceResult } from "../shared/types";

export type SuggestedAction =
  | "HOLD"
  | "INCREASE"
  | "REDUCE"
  | "EXIT"
  | "WATCH";

export type MomentumSignal = "STRONG_UP" | "UP" | "FLAT" | "DOWN" | "STRONG_DOWN";
export type TrendStrength = "STRONG" | "MODERATE" | "WEAK" | "STALLING";

export interface PositionIntelligenceInput {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT" | "-";
  entry: number;
  current: number;
  stop: number;
  tp1: number;
  pnlPct: number;
  pnl: number;
  slDistancePct: number | null;
  /** Age string like "2g", "3s", "14d" — already formatted by dashboard */
  age: string;
  /** Age in milliseconds — for precise duration calculations */
  openedAtMs?: number;
  /** AI score 0-100 from signal engine */
  score: number;
  /** Allocated capital in TL */
  allocated: number;
  qty: number;
}

export interface PositionMetrics {
  momentum: MomentumSignal;
  momentumScore: number;
  trendStrength: TrendStrength;
  trendStrengthScore: number;
  reversalProbability: number;
  suggestedAction: SuggestedAction;
  holdingDays: number | null;
  riskRewardCurrent: number | null;
  targetProgress: number | null;
  stopProximityRisk: "CRITICAL" | "HIGH" | "MODERATE" | "LOW";
}

export type PositionContext = IntelligenceResult<PositionMetrics>;
