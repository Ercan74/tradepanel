/**
 * TIOS Intelligence Engine — Market Score
 * Computes a 0–100 composite market score from weighted sub-scores.
 */

import { MarketScoreInput } from "../shared/types";
import { weightedAverage, WeightedInput } from "../shared/scoring";
import {
  MARKET_SCORE_WEIGHTS,
  MARKET_SCORE_DEFAULT_MISSING,
} from "./constants";

export interface MarketScoreResult {
  score: number;
  providedInputCount: number;
  usedDefaults: string[];
}

/**
 * Calculates a weighted composite market score.
 * Missing inputs are substituted with a neutral default and flagged.
 */
export function calculateMarketScore(input: MarketScoreInput): MarketScoreResult {
  const usedDefaults: string[] = [];

  function resolve(key: keyof MarketScoreInput, label: string): number {
    if (input[key] !== undefined && input[key] !== null) {
      return input[key] as number;
    }
    usedDefaults.push(label);
    return MARKET_SCORE_DEFAULT_MISSING;
  }

  const inputs: WeightedInput[] = [
    { value: resolve("globalTrendScore", "globalTrend"), weight: MARKET_SCORE_WEIGHTS.global },
    { value: resolve("breadthScore", "breadth"),         weight: MARKET_SCORE_WEIGHTS.breadth },
    { value: resolve("trendScore", "trend"),             weight: MARKET_SCORE_WEIGHTS.trend },
    { value: resolve("volatilityScore", "volatility"),   weight: MARKET_SCORE_WEIGHTS.volatility },
    { value: resolve("currencyScore", "currency"),       weight: MARKET_SCORE_WEIGHTS.currency },
    { value: resolve("flowScore", "flow"),               weight: MARKET_SCORE_WEIGHTS.flow },
  ];

  const providedInputCount = inputs.length - usedDefaults.length;
  const score = weightedAverage(inputs);

  return { score, providedInputCount, usedDefaults };
}
