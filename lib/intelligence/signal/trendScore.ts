/**
 * TIOS Intelligence Engine — Signal Trend Score
 * Measures how well the signal aligns with the prevailing trend.
 */

import { clamp } from "../shared/scoring";
import { SCORE_MIN, SCORE_MAX } from "../shared/constants";
import { RSI_THRESHOLDS, SLOPE_THRESHOLDS } from "./constants";

/**
 * Computes a 0-100 trend alignment score.
 * A LONG signal with RSI in healthy zone + positive slope = strong trend alignment.
 * A LONG signal with RSI overbought + flat slope = weak alignment.
 */
export function calculateTrendScore(
  side: "LONG" | "SHORT" | "-",
  rsi: number | null,
  slopePct: number | null
): number {
  if (side === "-") return 50;

  let score = 50; // Neutral baseline

  // RSI contribution (40 points)
  if (rsi !== null) {
    if (side === "LONG") {
      if (rsi >= RSI_THRESHOLDS.OVERBOUGHT) score -= 20;
      else if (rsi >= RSI_THRESHOLDS.OVERBOUGHT_MODERATE) score -= 5;
      else if (rsi >= RSI_THRESHOLDS.NEUTRAL_HIGH) score += 20;
      else if (rsi >= RSI_THRESHOLDS.NEUTRAL_LOW) score += 10;
      else if (rsi >= RSI_THRESHOLDS.OVERSOLD_MODERATE) score += 5;
      else score -= 5; // Extremely oversold may mean reversal, not continuation
    } else {
      // SHORT: inverse RSI logic
      if (rsi <= RSI_THRESHOLDS.OVERSOLD) score -= 20;
      else if (rsi <= RSI_THRESHOLDS.OVERSOLD_MODERATE) score -= 5;
      else if (rsi <= RSI_THRESHOLDS.NEUTRAL_LOW) score += 20;
      else if (rsi <= RSI_THRESHOLDS.NEUTRAL_HIGH) score += 10;
      else if (rsi <= RSI_THRESHOLDS.OVERBOUGHT_MODERATE) score += 5;
      else score -= 5;
    }
  }

  // Slope contribution (30 points)
  if (slopePct !== null) {
    if (side === "LONG") {
      if (slopePct >= SLOPE_THRESHOLDS.STRONG_UP) score += 25;
      else if (slopePct >= SLOPE_THRESHOLDS.UP) score += 12;
      else if (slopePct <= SLOPE_THRESHOLDS.STRONG_DOWN) score -= 25;
      else if (slopePct <= SLOPE_THRESHOLDS.DOWN) score -= 12;
    } else {
      if (slopePct <= SLOPE_THRESHOLDS.STRONG_DOWN) score += 25;
      else if (slopePct <= SLOPE_THRESHOLDS.DOWN) score += 12;
      else if (slopePct >= SLOPE_THRESHOLDS.STRONG_UP) score -= 25;
      else if (slopePct >= SLOPE_THRESHOLDS.UP) score -= 12;
    }
  }

  return clamp(score, SCORE_MIN, SCORE_MAX);
}
