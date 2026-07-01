/**
 * TIOS Intelligence Engine — Signal Module Constants
 * All thresholds live here. No magic numbers in logic files.
 */

/** Quality grade score boundaries */
export const QUALITY_GRADE_THRESHOLDS = {
  A_PLUS: 90,
  A: 80,
  B_PLUS: 70,
  B: 60,
  C: 45,
  // Below C → D
} as const;

/** RSI boundaries for signal analysis */
export const RSI_THRESHOLDS = {
  OVERBOUGHT: 70,
  OVERBOUGHT_MODERATE: 60,
  OVERSOLD: 30,
  OVERSOLD_MODERATE: 40,
  NEUTRAL_HIGH: 55,
  NEUTRAL_LOW: 45,
} as const;

/** MACD histogram momentum thresholds */
export const MACD_THRESHOLDS = {
  STRONG_BULLISH: 0.5,
  BULLISH: 0.1,
  BEARISH: -0.1,
  STRONG_BEARISH: -0.5,
} as const;

/** EMA slope % thresholds for trend scoring */
export const SLOPE_THRESHOLDS = {
  STRONG_UP: 0.3,
  UP: 0.05,
  DOWN: -0.05,
  STRONG_DOWN: -0.3,
} as const;

/** Distance from EMA in ATR units — entry timing */
export const DIST_ATR_THRESHOLDS = {
  OPTIMAL: 0.5,     // Very close to EMA → fresh signal
  GOOD: 1.0,
  ACCEPTABLE: 2.0,
  LATE: 3.0,
  // Above LATE → RISKY (chasing the move)
} as const;

/** Risk level thresholds */
export const RISK_LEVEL_THRESHOLDS = {
  EXTREME: 75,
  HIGH: 55,
  MODERATE: 35,
  // Below MODERATE → LOW
} as const;

/** AI confidence penalty per missing technical field */
export const CONFIDENCE_MISSING_TECHNICAL_PENALTY = 8;

/** Sources label */
export const SOURCE_COMPUTED = "signal-engine";
