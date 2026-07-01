/**
 * TIOS Intelligence Engine — Decision Module Types
 *
 * The Decision Engine aggregates outputs from all four previous engines
 * (Global, Portfolio, Position, Signal) into a single, actionable decision
 * for each open position.
 */

import { IntelligenceResult } from "../shared/types";
import { RiskRegime } from "../shared/types";
import { SuggestedAction } from "../position/types";

export type DecisionAction =
  | "INCREASE"   // Add to this position — all signals aligned positively
  | "HOLD"       // Keep current position — no strong signal either way
  | "REDUCE"     // Partially close — take some profit or cut risk
  | "EXIT"       // Close this position — risk or reversal signal is too strong
  | "WATCH";     // Monitor closely — conflicting signals, no action yet

export type DecisionConfidence = "HIGH" | "MODERATE" | "LOW";
export type DecisionUrgency = "IMMEDIATE" | "TODAY" | "MONITOR" | "NONE";

export interface DecisionInput {
  // --- Position snapshot ---
  positionId: string;
  symbol: string;
  side: "LONG" | "SHORT" | "-";
  pnlPct: number;
  slDistancePct: number | null;
  age: string;

  // --- Global context ---
  riskRegime: RiskRegime;
  marketScore: number;
  globalConfidence: number;

  // --- Portfolio context ---
  portfolioRiskScore: number;
  portfolioHeatLevel: "LOW" | "MODERATE" | "ELEVATED" | "HIGH";
  cashUsagePct: number;

  // --- Position intelligence ---
  positionAction: SuggestedAction;
  positionMomentumScore: number;
  positionReversalProbability: number;
  positionStopProximityRisk: "CRITICAL" | "HIGH" | "MODERATE" | "LOW";
  positionTrendStrengthScore: number;
  positionRiskRewardCurrent: number | null;
}

export interface DecisionMetrics {
  action: DecisionAction;
  confidence: DecisionConfidence;
  urgency: DecisionUrgency;
  /** 0-100 composite conviction score for this decision */
  convictionScore: number;
  /** Primary reason for this decision (most important factor) */
  primaryReason: string;
  /** Supporting factors */
  supportingFactors: string[];
  /** Risk factors that were considered */
  riskFactors: string[];
  /** How much each engine contributed to the decision */
  engineWeights: {
    global: number;
    portfolio: number;
    position: number;
  };
}

export type DecisionContext = IntelligenceResult<DecisionMetrics>;
