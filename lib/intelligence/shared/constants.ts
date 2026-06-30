/**
 * TIOS Intelligence Engine — Shared Constants
 * All numeric thresholds and weights live here. Never use magic numbers in logic.
 */

export const SCORE_MIN = 0;
export const SCORE_MAX = 100;

export const CONFIDENCE_MIN = 0;
export const CONFIDENCE_MAX = 100;

/** Penalty applied to confidence per missing input field */
export const CONFIDENCE_MISSING_INPUT_PENALTY = 10;

/** Penalty applied to confidence when signals conflict */
export const CONFIDENCE_CONFLICT_PENALTY = 15;

/** Number of decimal places to round scores to */
export const SCORE_PRECISION = 2;
