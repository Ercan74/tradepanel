/**
 * TIOS Intelligence Engine — Shared Types
 * All intelligence modules must conform to these contracts.
 */

export interface IntelligenceResult<T> {
  value: T;
  confidence: number;
  reasons: string[];
  warnings: string[];
  timestamp: string;
  sources: string[];
}

export type RiskRegime =
  | "RISK_ON"
  | "SELECTIVE_LONG"
  | "NEUTRAL"
  | "RISK_OFF";

export interface MarketScoreInput {
  globalTrendScore?: number;
  breadthScore?: number;
  trendScore?: number;
  volatilityScore?: number;
  currencyScore?: number;
  flowScore?: number;
}

export interface GlobalContext {
  marketScore: number;
  riskRegime: RiskRegime;
  confidence: number;
  commentary: string;
  reasons: string[];
  warnings: string[];
  timestamp: string;
  sources: string[];
}
