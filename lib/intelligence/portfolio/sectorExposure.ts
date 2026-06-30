/**
 * TIOS Intelligence Engine — Sector Exposure
 * Groups allocated capital by sector.
 */

import { PortfolioPositionInput, SectorExposure } from "./types";
import { UNKNOWN_SECTOR_LABEL } from "./constants";
import { resolveAllocated } from "./shared";

/**
 * Computes capital allocation and position count per sector.
 * Positions without sector data are grouped under UNKNOWN_SECTOR_LABEL
 * rather than being dropped — every position must be accounted for.
 */
export function calculateSectorExposure(
  positions: PortfolioPositionInput[]
): SectorExposure[] {
  const totals = new Map<string, { allocated: number; count: number }>();

  for (const position of positions) {
    const sector = position.sector?.trim() || UNKNOWN_SECTOR_LABEL;
    const allocated = resolveAllocated(position);

    const existing = totals.get(sector) ?? { allocated: 0, count: 0 };
    existing.allocated += allocated;
    existing.count += 1;
    totals.set(sector, existing);
  }

  const totalAllocated = Array.from(totals.values()).reduce(
    (sum, t) => sum + t.allocated,
    0
  );

  return Array.from(totals.entries())
    .map(([sector, { allocated, count }]) => ({
      sector,
      allocated,
      pct: totalAllocated > 0 ? (allocated / totalAllocated) * 100 : 0,
      positionCount: count,
    }))
    .sort((a, b) => b.allocated - a.allocated);
}
