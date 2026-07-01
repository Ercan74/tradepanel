/**
 * TIOS Intelligence Engine — Decision Module Constants
 * Engine weights and decision thresholds. No magic numbers in logic.
 */

/**
 * Engine contribution weights to the final conviction score.
 * Must represent relative importance — they are normalized internally.
 *
 * Global Intelligence: 30% — market environment is the macro filter.
 *   If the market is RISK_OFF, no single position signal justifies adding risk.
 * Portfolio Intelligence: 25% — portfolio-level heat and capacity constraints.
 * Position Intelligence: 45% — the position's own metrics are the primary input.
 */
export const ENGINE_WEIGHTS = {
  global: 30,
  portfolio: 25,
  position: 45,
} as const;

/** Market regime veto thresholds */
export const REGIME_VETO = {
  /** RISK_OFF regime: never recommend INCREASE regardless of position signals */
  BLOCK_INCREASE_BELOW_MARKET_SCORE: 45,
  /** RISK_OFF regime: recommend EXIT if position is also losing */
  ACCELERATE_EXIT_BELOW_MARKET_SCORE: 45,
} as const;

/** Portfolio heat veto thresholds */
export const PORTFOLIO_VETO = {
  /** If portfolio heat is HIGH: no INCREASE allowed */
  BLOCK_INCREASE_AT_HEAT: "HIGH" as const,
  /** If cash usage >= this: no INCREASE */
  BLOCK_INCREASE_CASH_USAGE_PCT: 90,
} as const;

/** Conviction score thresholds */
export const CONVICTION_THRESHOLDS = {
  HIGH: 70,
  MODERATE: 45,
  // Below MODERATE → LOW
} as const;

/** Urgency thresholds */
export const URGENCY_THRESHOLDS = {
  IMMEDIATE_REVERSAL_PROB: 70,
  IMMEDIATE_STOP_PROXIMITY: "CRITICAL" as const,
  TODAY_REVERSAL_PROB: 50,
  TODAY_STOP_PROXIMITY: "HIGH" as const,
} as const;

/** Sources label */
export const SOURCE_COMPUTED = "decision-engine";
