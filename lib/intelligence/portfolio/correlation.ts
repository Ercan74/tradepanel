/**
 * TIOS Intelligence Engine — Correlation Risk (proxy)
 *
 * True price-correlation data is not yet available from the live feed.
 * As an honest proxy, correlation risk is estimated from:
 *  1. Sector concentration (same sector positions tend to move together)
 *  2. Same-direction positioning within a sector (amplifies correlated risk)
 *
 * This MUST be replaced with real price-correlation analysis once
 * historical price series are available — see SOURCE_PARTIAL_SECTOR_DATA
 * and the warnings surfaced by getPortfolioContext.
 */

import { PortfolioPositionInput, SectorExposure } from "./types";
import { weightedAverage } from "../shared/scoring";
import { SCORE_MIN, SCORE_MAX } from "../shared/constants";
import { CORRELATION_WEIGHTS, UNKNOWN_SECTOR_LABEL } from "./constants";

/**
 * Concentration component: derived from the same Herfindahl-style measure
 * used in diversification, but expressed as a risk score (higher = riskier).
 */
function sectorConcentrationRisk(sectorExposure: SectorExposure[]): number {
  if (sectorExposure.length === 0) return SCORE_MIN;
  const shares = sectorExposure.map((s) => s.pct / 100);
  const herfindahl = shares.reduce((sum, share) => sum + share * share, 0);
  return Math.min(SCORE_MAX, herfindahl * 100);
}

/**
 * Same-direction-within-sector component: for each sector with more than
 * one position, what fraction of those positions share the same side.
 * A sector entirely LONG or entirely SHORT contributes full risk.
 */
function sameDirectionRisk(positions: PortfolioPositionInput[]): number {
  const bySector = new Map<string, PortfolioPositionInput[]>();

  for (const position of positions) {
    const sector = position.sector?.trim() || UNKNOWN_SECTOR_LABEL;
    const list = bySector.get(sector) ?? [];
    list.push(position);
    bySector.set(sector, list);
  }

  const multiPositionSectors = Array.from(bySector.values()).filter(
    (list) => list.length > 1
  );

  if (multiPositionSectors.length === 0) return SCORE_MIN;

  const sectorScores = multiPositionSectors.map((list) => {
    const longCount = list.filter((p) => p.side === "LONG").length;
    const shortCount = list.length - longCount;
    const dominantShare = Math.max(longCount, shortCount) / list.length;
    // dominantShare of 0.5 (perfectly balanced) → 0 risk
    // dominantShare of 1.0 (all same side) → 100 risk
    return (dominantShare - 0.5) * 2 * 100;
  });

  const average =
    sectorScores.reduce((sum, s) => sum + s, 0) / sectorScores.length;

  return Math.max(SCORE_MIN, average);
}

/**
 * Computes a 0–100 correlation risk score. Higher = positions are more
 * likely to move together, amplifying drawdown risk.
 */
export function calculateCorrelationScore(
  positions: PortfolioPositionInput[],
  sectorExposure: SectorExposure[]
): number {
  return weightedAverage([
    {
      value: sectorConcentrationRisk(sectorExposure),
      weight: CORRELATION_WEIGHTS.sectorConcentration,
    },
    {
      value: sameDirectionRisk(positions),
      weight: CORRELATION_WEIGHTS.sameDirectionWithinSector,
    },
  ]);
}
