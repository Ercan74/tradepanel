/**
 * TIOS Intelligence Engine — Portfolio Module Constants
 * All thresholds, weights, and boundaries live here. No magic numbers
 * belong anywhere else, including UI components.
 */

/** Maximum number of concurrently open positions the system is sized for. */
export const MAX_OPEN_POSITIONS = 10;

/** Label used for positions whose sector is not yet known (e.g. live feed not populated). */
export const UNKNOWN_SECTOR_LABEL = "Bilinmiyor";

/**
 * Heat score weights. A position's contribution to heat is driven by
 * its capital concentration and its directional exposure (one-sided
 * portfolios run hotter than balanced long/short books).
 */
export const HEAT_WEIGHTS = {
  concentration: 60,
  directionalSkew: 40,
} as const;

/** Heat score boundaries (inclusive lower bound) for display classification. */
export const HEAT_LEVEL_THRESHOLDS = {
  HIGH: 75,
  ELEVATED: 50,
  MODERATE: 25,
  // Below MODERATE → LOW
} as const;

/**
 * Diversification reference point: the number of distinct sectors at which
 * the portfolio is considered "fully diversified" for scoring purposes.
 */
export const DIVERSIFICATION_TARGET_SECTOR_COUNT = 5;

/**
 * Correlation proxy weights. Without true price-correlation data (not yet
 * available from the live feed), correlation risk is approximated from
 * sector concentration and same-direction positioning within a sector.
 */
export const CORRELATION_WEIGHTS = {
  sectorConcentration: 70,
  sameDirectionWithinSector: 30,
} as const;

/**
 * Composite portfolio risk score weights. Must sum to 100.
 */
export const PORTFOLIO_RISK_WEIGHTS = {
  heat: 40,
  correlation: 35,
  diversificationInverse: 25,
} as const;

/** Total number of expected input fields used in confidence calculation. */
export const PORTFOLIO_TOTAL_INPUT_FIELDS = 2; // positions[], accountCapital

/** Sources label for computed portfolio metrics */
export const SOURCE_COMPUTED = "portfolio-engine";

/** Sources label used when one or more positions are missing sector data */
export const SOURCE_PARTIAL_SECTOR_DATA = "partial-sector-data";
