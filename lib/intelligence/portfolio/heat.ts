/**
 * TIOS Intelligence Engine — Portfolio Heat
 * Measures how "hot" (risk-concentrated) the open book currently is.
 */

import { PortfolioPositionInput, SectorExposure, PortfolioHeatLevel } from "./types";
import { weightedAverage } from "../shared/scoring";
import { SCORE_MIN, SCORE_MAX } from "../shared/constants";
import { HEAT_WEIGHTS, HEAT_LEVEL_THRESHOLDS } from "./constants";

/**
 * Concentration heat: the largest single position's share of total
 * allocated capital. A book dominated by one position runs hotter.
 */
function concentrationHeat(
  positions: PortfolioPositionInput[],
  allocatedTotal: number
): number {
  if (positions.length === 0 || allocatedTotal <= 0) return SCORE_MIN;

  const allocations = positions.map((p) =>
    p.allocated !== undefined && p.allocated !== null
      ? p.allocated
      : p.entry * p.qty
  );

  const largest = Math.max(...allocations);
  return Math.min(SCORE_MAX, (largest / allocatedTotal) * 100);
}

/**
 * Directional skew heat: how one-sided the book is between long and short.
 * A perfectly balanced book (50/50) contributes 0; an all-long or
 * all-short book contributes full heat.
 */
function directionalSkewHeat(positions: PortfolioPositionInput[]): number {
  if (positions.length === 0) return SCORE_MIN;

  const longCount = positions.filter((p) => p.side === "LONG").length;
  const dominantShare = Math.max(longCount, positions.length - longCount) / positions.length;

  return Math.max(SCORE_MIN, (dominantShare - 0.5) * 2 * 100);
}

export interface HeatResult {
  score: number;
  level: PortfolioHeatLevel;
}

/**
 * Maps a 0–100 heat score to a display-friendly level.
 */
function mapHeatLevel(score: number): PortfolioHeatLevel {
  if (score >= HEAT_LEVEL_THRESHOLDS.HIGH) return "HIGH";
  if (score >= HEAT_LEVEL_THRESHOLDS.ELEVATED) return "ELEVATED";
  if (score >= HEAT_LEVEL_THRESHOLDS.MODERATE) return "MODERATE";
  return "LOW";
}

/**
 * Computes the portfolio heat score and level.
 */
export function calculatePortfolioHeat(
  positions: PortfolioPositionInput[],
  allocatedTotal: number
): HeatResult {
  const score = weightedAverage([
    { value: concentrationHeat(positions, allocatedTotal), weight: HEAT_WEIGHTS.concentration },
    { value: directionalSkewHeat(positions), weight: HEAT_WEIGHTS.directionalSkew },
  ]);

  return { score, level: mapHeatLevel(score) };
}
