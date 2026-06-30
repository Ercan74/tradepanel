/**
 * TIOS Intelligence Engine — Portfolio Shared Helpers
 * Small utilities reused across portfolio metric calculators.
 */

import { PortfolioPositionInput } from "./types";

/**
 * Resolves the capital allocated to a position. Prefers an explicit
 * `allocated` value; falls back to entry price * quantity.
 */
export function resolveAllocated(position: PortfolioPositionInput): number {
  if (position.allocated !== undefined && position.allocated !== null) {
    return position.allocated;
  }
  return position.entry * position.qty;
}

/**
 * Total capital currently allocated across all positions.
 */
export function totalAllocated(positions: PortfolioPositionInput[]): number {
  return positions.reduce((sum, p) => sum + resolveAllocated(p), 0);
}
