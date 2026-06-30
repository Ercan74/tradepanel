/**
 * TIOS Intelligence Engine — Global Module Constants
 * All thresholds, weights, and regime boundaries live here.
 * No magic numbers belong anywhere else, including UI components.
 */

/** Score weights used in marketScore calculation. Must sum to 100. */
export const MARKET_SCORE_WEIGHTS = {
  global: 25,
  breadth: 20,
  trend: 20,
  volatility: 15,
  currency: 10,
  flow: 10,
} as const;

/** Risk regime score boundaries (inclusive lower bound) */
export const RISK_REGIME_THRESHOLDS = {
  RISK_ON: 80,
  SELECTIVE_LONG: 60,
  NEUTRAL: 45,
  // Below NEUTRAL threshold → RISK_OFF
} as const;

/** Total number of market score input fields */
export const MARKET_SCORE_TOTAL_INPUTS = 6;

/** Default neutral score used when an input is missing */
export const MARKET_SCORE_DEFAULT_MISSING = 50;

/** Sources label used when missing inputs are substituted with neutral defaults */
export const SOURCE_FALLBACK_DEFAULTS = "fallback-defaults";

/** Sources label for computed scores */
export const SOURCE_COMPUTED = "intelligence-engine";

/**
 * Confidence band thresholds used purely for display classification
 * (e.g. "High conviction" vs "Low conviction"). Components must import
 * these instead of hardcoding numeric comparisons.
 */
export const CONFIDENCE_DISPLAY_THRESHOLDS = {
  HIGH: 80,
  MODERATE: 60,
  LOW: 40,
} as const;
