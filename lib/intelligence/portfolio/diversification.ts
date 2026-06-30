/**
 * TIOS Intelligence Engine — Diversification
 * Scores how spread out the portfolio's capital is across sectors,
 * using a Herfindahl-Hirschman-style concentration measure.
 */

import { SectorExposure } from "./types";
import { clamp, normalizeScore } from "../shared/scoring";
import { SCORE_MIN, SCORE_MAX } from "../shared/constants";
import { DIVERSIFICATION_TARGET_SECTOR_COUNT } from "./constants";

/**
 * Computes a 0–100 diversification score from sector exposure data.
 * Higher score = capital is spread across more sectors more evenly.
 *
 * Method: effective sector count = 1 / sum(share^2) (inverse HHI),
 * then normalized against DIVERSIFICATION_TARGET_SECTOR_COUNT.
 */
export function calculateDiversificationScore(
  sectorExposure: SectorExposure[]
): number {
  if (sectorExposure.length === 0) return SCORE_MIN;
  if (sectorExposure.length === 1) return SCORE_MIN;

  const shares = sectorExposure.map((s) => s.pct / 100);
  const herfindahl = shares.reduce((sum, share) => sum + share * share, 0);

  if (herfindahl <= 0) return SCORE_MIN;

  const effectiveSectorCount = 1 / herfindahl;

  return clamp(
    normalizeScore(effectiveSectorCount, 1, DIVERSIFICATION_TARGET_SECTOR_COUNT),
    SCORE_MIN,
    SCORE_MAX
  );
}
