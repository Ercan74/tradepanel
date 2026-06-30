/**
 * TIOS Intelligence Engine — Cash Usage
 * Computes used vs free capital percentages.
 */

import { PortfolioPositionInput } from "./types";
import { clamp } from "../shared/scoring";
import { SCORE_MIN, SCORE_MAX } from "../shared/constants";
import { totalAllocated } from "./shared";

export interface CashUsageResult {
  usedPct: number;
  freePct: number;
  allocated: number;
  free: number;
}

/**
 * Computes the percentage of account capital currently allocated to
 * open positions, and the remaining free percentage.
 */
export function calculateCashUsage(
  positions: PortfolioPositionInput[],
  accountCapital: number
): CashUsageResult {
  const allocated = totalAllocated(positions);

  if (accountCapital <= 0) {
    return { usedPct: SCORE_MIN, freePct: SCORE_MAX, allocated, free: 0 };
  }

  const usedPct = clamp((allocated / accountCapital) * 100, SCORE_MIN, SCORE_MAX);
  const freePct = clamp(SCORE_MAX - usedPct, SCORE_MIN, SCORE_MAX);
  const free = Math.max(0, accountCapital - allocated);

  return { usedPct, freePct, allocated, free };
}
