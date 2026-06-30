/**
 * TIOS Intelligence Engine — Scoring Helpers
 * Pure, testable utility functions. No side effects.
 */

import {
  SCORE_MIN,
  SCORE_MAX,
  CONFIDENCE_MIN,
  CONFIDENCE_MAX,
  CONFIDENCE_MISSING_INPUT_PENALTY,
  CONFIDENCE_CONFLICT_PENALTY,
  SCORE_PRECISION,
} from "./constants";

/**
 * Clamps a number between min and max (inclusive).
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Normalizes a score to the 0–100 range given a known input min/max.
 */
export function normalizeScore(
  value: number,
  inputMin: number,
  inputMax: number
): number {
  if (inputMax === inputMin) return SCORE_MIN;
  const raw =
    ((value - inputMin) / (inputMax - inputMin)) * (SCORE_MAX - SCORE_MIN) +
    SCORE_MIN;
  return clamp(parseFloat(raw.toFixed(SCORE_PRECISION)), SCORE_MIN, SCORE_MAX);
}

export interface WeightedInput {
  value: number;
  weight: number;
}

/**
 * Computes a weighted average from a list of {value, weight} pairs.
 * Returns 0 if total weight is 0.
 */
export function weightedAverage(inputs: WeightedInput[]): number {
  const totalWeight = inputs.reduce((sum, i) => sum + i.weight, 0);
  if (totalWeight === 0) return SCORE_MIN;
  const raw =
    inputs.reduce((sum, i) => sum + i.value * i.weight, 0) / totalWeight;
  return clamp(parseFloat(raw.toFixed(SCORE_PRECISION)), SCORE_MIN, SCORE_MAX);
}

export interface ConfidenceOptions {
  /** Total number of possible input fields */
  totalInputs: number;
  /** Number of inputs that were actually provided */
  providedInputs: number;
  /** Number of detected signal conflicts */
  conflictCount?: number;
}

/**
 * Calculates confidence as a 0–100 score based on data completeness
 * and the presence of conflicting signals.
 */
export function calculateConfidence(options: ConfidenceOptions): number {
  const { totalInputs, providedInputs, conflictCount = 0 } = options;

  const missingCount = totalInputs - providedInputs;
  const basePenalty = missingCount * CONFIDENCE_MISSING_INPUT_PENALTY;
  const conflictPenalty = conflictCount * CONFIDENCE_CONFLICT_PENALTY;

  const raw = CONFIDENCE_MAX - basePenalty - conflictPenalty;
  return clamp(raw, CONFIDENCE_MIN, CONFIDENCE_MAX);
}
