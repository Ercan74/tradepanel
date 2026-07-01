/**
 * TIOS Intelligence Engine — Position Reversal Probability
 * Estimates the probability of a trend reversal based on multiple signals.
 */

import { clamp } from "../shared/scoring";
import { SCORE_MIN, SCORE_MAX } from "../shared/constants";
import { TARGET_PROGRESS_THRESHOLDS } from "./constants";

export interface ReversalInput {
  pnlPct: number;
  side: "LONG" | "SHORT" | "-";
  slDistancePct: number | null;
  targetProgress: number | null;
  aiScore: number;
  trendStrengthScore: number;
}

/**
 * Computes reversal probability (0-100). Higher = more likely to reverse.
 *
 * Factors:
 * 1. Large gains increase reversal risk (mean reversion tendency)
 * 2. Near target → more likely to pull back
 * 3. Stalling trend increases reversal risk
 * 4. Low AI score increases reversal risk
 */
export function calculateReversalProbability(input: ReversalInput): number {
  const effectivePct = input.side === "SHORT" ? -input.pnlPct : input.pnlPct;
  let score = 30; // Base probability

  // Large gain → higher reversal risk (positions up >8% tend to correct)
  if (effectivePct >= 8) score += 25;
  else if (effectivePct >= 5) score += 15;
  else if (effectivePct >= 3) score += 8;
  else if (effectivePct < -3) score -= 10; // Losing → reversal might be bullish, but still risky

  // Near target → reversal likely after hitting resistance/target
  if (input.targetProgress !== null) {
    if (input.targetProgress >= TARGET_PROGRESS_THRESHOLDS.NEAR_TARGET) score += 20;
    else if (input.targetProgress >= TARGET_PROGRESS_THRESHOLDS.HALFWAY) score += 10;
  }

  // Stalling trend → reversal risk
  const trendRisk = Math.max(0, 50 - input.trendStrengthScore) / 2;
  score += trendRisk;

  // Low AI score → signal quality declining
  if (input.aiScore < 50) score += 10;
  else if (input.aiScore > 80) score -= 10;

  return clamp(parseFloat(score.toFixed(1)), SCORE_MIN, SCORE_MAX);
}
