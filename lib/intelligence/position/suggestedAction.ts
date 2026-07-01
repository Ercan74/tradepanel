/**
 * TIOS Intelligence Engine — Suggested Action
 * Derives a suggested trading action from position metrics.
 */

import { SuggestedAction, MomentumSignal, TrendStrength } from "./types";
import {
  STOP_PROXIMITY_THRESHOLDS,
  TARGET_PROGRESS_THRESHOLDS,
  REVERSAL_PROBABILITY_THRESHOLDS,
} from "./constants";

export interface ActionInput {
  momentum: MomentumSignal;
  trendStrength: TrendStrength;
  reversalProbability: number;
  slDistancePct: number | null;
  targetProgress: number | null;
  pnlPct: number;
  side: "LONG" | "SHORT" | "-";
}

/**
 * Rule-based suggested action engine.
 * Priority order: EXIT (stop risk) > REDUCE (target/reversal) > INCREASE (strong trend) > WATCH (weak) > HOLD
 */
export function calculateSuggestedAction(input: ActionInput): SuggestedAction {
  const effectivePct = input.side === "SHORT" ? -input.pnlPct : input.pnlPct;

  // 1. EXIT — stop critically close or position severely underwater
  if (
    input.slDistancePct !== null &&
    input.slDistancePct <= STOP_PROXIMITY_THRESHOLDS.CRITICAL
  ) {
    return "EXIT";
  }

  // 2. REDUCE — near target or high reversal probability
  if (
    (input.targetProgress !== null &&
      input.targetProgress >= TARGET_PROGRESS_THRESHOLDS.NEAR_TARGET) ||
    input.reversalProbability >= REVERSAL_PROBABILITY_THRESHOLDS.HIGH
  ) {
    return "REDUCE";
  }

  // 3. INCREASE — strong momentum + strong trend + low reversal risk
  if (
    (input.momentum === "STRONG_UP" || input.momentum === "UP") &&
    (input.trendStrength === "STRONG" || input.trendStrength === "MODERATE") &&
    input.reversalProbability < REVERSAL_PROBABILITY_THRESHOLDS.MODERATE &&
    effectivePct > 0
  ) {
    return "INCREASE";
  }

  // 4. WATCH — weak/stalling trend or moderate reversal risk, needs monitoring
  if (
    input.trendStrength === "STALLING" ||
    input.trendStrength === "WEAK" ||
    input.reversalProbability >= REVERSAL_PROBABILITY_THRESHOLDS.MODERATE ||
    input.momentum === "DOWN" ||
    input.momentum === "STRONG_DOWN"
  ) {
    return "WATCH";
  }

  // 5. HOLD — default: everything is okay, stay the course
  return "HOLD";
}
