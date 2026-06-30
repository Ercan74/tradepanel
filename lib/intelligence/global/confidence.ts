/**
 * TIOS Intelligence Engine — Global Confidence
 * Computes confidence score from data completeness and signal conflicts.
 */

import { RiskRegime } from "../shared/types";
import { calculateConfidence } from "../shared/scoring";
import { MARKET_SCORE_TOTAL_INPUTS } from "./constants";

export interface GlobalConfidenceInput {
  providedInputCount: number;
  riskRegime: RiskRegime;
  marketScore: number;
}

/**
 * Detects the number of conflicting signals.
 * A conflict occurs when the score sits right on a regime boundary,
 * suggesting the model is uncertain about classification.
 */
function detectConflicts(marketScore: number, riskRegime: RiskRegime): number {
  const BOUNDARY_TOLERANCE = 3;

  const boundaries: Record<number, RiskRegime[]> = {
    80: ["RISK_ON", "SELECTIVE_LONG"],
    60: ["SELECTIVE_LONG", "NEUTRAL"],
    45: ["NEUTRAL", "RISK_OFF"],
  };

  for (const [boundary, regimes] of Object.entries(boundaries)) {
    const threshold = Number(boundary);
    if (
      Math.abs(marketScore - threshold) <= BOUNDARY_TOLERANCE &&
      regimes.includes(riskRegime)
    ) {
      return 1;
    }
  }

  return 0;
}

/**
 * Returns a 0–100 confidence score for the global context output.
 */
export function computeGlobalConfidence(input: GlobalConfidenceInput): number {
  const conflictCount = detectConflicts(input.marketScore, input.riskRegime);

  return calculateConfidence({
    totalInputs: MARKET_SCORE_TOTAL_INPUTS,
    providedInputs: input.providedInputCount,
    conflictCount,
  });
}
