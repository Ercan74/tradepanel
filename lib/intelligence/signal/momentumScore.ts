/**
 * TIOS Intelligence Engine — Signal Momentum Score
 * Measures the momentum strength at signal generation time.
 */

import { clamp } from "../shared/scoring";
import { SCORE_MIN, SCORE_MAX } from "../shared/constants";
import { MACD_THRESHOLDS } from "./constants";

/**
 * Computes a 0-100 momentum score from MACD histogram.
 * Score 50 = no momentum signal, >50 = bullish momentum, <50 = bearish.
 * For SHORT positions, bearish momentum is favorable (higher score).
 */
export function calculateMomentumScore(
  side: "LONG" | "SHORT" | "-",
  macdHist: number | null
): number {
  if (macdHist === null) return 50;

  // Raw momentum direction (positive = bullish, negative = bearish)
  let rawScore: number;

  if (macdHist >= MACD_THRESHOLDS.STRONG_BULLISH) rawScore = 85;
  else if (macdHist >= MACD_THRESHOLDS.BULLISH) rawScore = 65;
  else if (macdHist <= MACD_THRESHOLDS.STRONG_BEARISH) rawScore = 15;
  else if (macdHist <= MACD_THRESHOLDS.BEARISH) rawScore = 35;
  else rawScore = 50;

  // For SHORT: invert (bearish = good)
  const score = side === "SHORT" ? 100 - rawScore : rawScore;

  return clamp(score, SCORE_MIN, SCORE_MAX);
}
