/**
 * TIOS Intelligence Engine — Position Module Constants
 * All thresholds and boundaries. No magic numbers in logic files.
 */

/** Momentum score boundaries (based on pnlPct relative to position size) */
export const MOMENTUM_THRESHOLDS = {
  STRONG_UP: 5,    // pnlPct >= +5%  → STRONG_UP
  UP: 1,           // pnlPct >= +1%  → UP
  DOWN: -1,        // pnlPct <= -1%  → DOWN
  STRONG_DOWN: -5, // pnlPct <= -5%  → STRONG_DOWN
  // Between -1 and +1 → FLAT
} as const;

/** Trend strength thresholds: gain per day held */
export const TREND_STRENGTH_THRESHOLDS = {
  STRONG: 1.0,    // >= 1% per day → STRONG
  MODERATE: 0.3,  // >= 0.3% per day → MODERATE
  WEAK: 0.05,     // >= 0.05% per day → WEAK
  // Below WEAK → STALLING
} as const;

/** Reversal probability thresholds */
export const REVERSAL_PROBABILITY_THRESHOLDS = {
  HIGH: 65,    // >= 65 → high reversal risk
  MODERATE: 40,
  LOW: 20,
} as const;

/** Stop proximity risk boundaries (slDistancePct) */
export const STOP_PROXIMITY_THRESHOLDS = {
  CRITICAL: 1.5,   // <= 1.5% from stop → CRITICAL
  HIGH: 3.0,       // <= 3.0% from stop → HIGH
  MODERATE: 6.0,   // <= 6.0% from stop → MODERATE
  // Above MODERATE → LOW
} as const;

/** Target progress: how far price has moved toward TP1 */
export const TARGET_PROGRESS_THRESHOLDS = {
  NEAR_TARGET: 80,  // >= 80% of the way to TP1 → consider reducing
  HALFWAY: 50,
} as const;

/** Suggested action weights */
export const ACTION_WEIGHTS = {
  momentum: 30,
  trendStrength: 25,
  reversalRisk: 25,
  stopProximity: 20,
} as const;

/** Sources label for computed position metrics */
export const SOURCE_COMPUTED = "position-engine";

/** Total expected input fields for confidence calculation */
export const POSITION_TOTAL_INPUT_FIELDS = 7;
