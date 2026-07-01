/**
 * TIOS Intelligence Engine — Decision Conviction & Urgency
 * Quantifies how confident the decision is and how quickly it should be acted on.
 */

import { DecisionInput, DecisionAction, DecisionConfidence, DecisionUrgency } from "./types";
import { ENGINE_WEIGHTS, CONVICTION_THRESHOLDS, URGENCY_THRESHOLDS } from "./constants";
import { weightedAverage } from "../shared/scoring";
import { clamp } from "../shared/scoring";
import { SCORE_MIN, SCORE_MAX } from "../shared/constants";

/**
 * Computes a 0-100 conviction score.
 * Higher = more aligned signals across all engines.
 */
export function calculateConviction(
  input: DecisionInput,
  action: DecisionAction
): number {
  // Global signal strength: how clearly the regime supports/opposes action
  let globalSignal: number;
  if (input.riskRegime === "RISK_ON") {
    globalSignal = action === "INCREASE" || action === "HOLD" ? 80 : 40;
  } else if (input.riskRegime === "SELECTIVE_LONG") {
    globalSignal = action === "INCREASE" ? 70 : action === "HOLD" ? 65 : 50;
  } else if (input.riskRegime === "NEUTRAL") {
    globalSignal = action === "WATCH" || action === "HOLD" ? 60 : 45;
  } else {
    // RISK_OFF
    globalSignal = action === "EXIT" || action === "REDUCE" ? 80 : 30;
  }
  globalSignal = globalSignal * (input.globalConfidence / 100);

  // Portfolio signal: how clearly portfolio state supports action
  const portfolioSignal =
    input.portfolioHeatLevel === "LOW" ? 75 :
    input.portfolioHeatLevel === "MODERATE" ? 60 :
    input.portfolioHeatLevel === "ELEVATED" ? 45 : 30;

  // Position signal: composite of position-level signals
  const positionSignal = clamp(
    (input.positionMomentumScore * 0.4 +
      input.positionTrendStrengthScore * 0.35 +
      (100 - input.positionReversalProbability) * 0.25),
    SCORE_MIN,
    SCORE_MAX
  );

  const raw = weightedAverage([
    { value: globalSignal,    weight: ENGINE_WEIGHTS.global },
    { value: portfolioSignal, weight: ENGINE_WEIGHTS.portfolio },
    { value: positionSignal,  weight: ENGINE_WEIGHTS.position },
  ]);

  return clamp(parseFloat(raw.toFixed(1)), SCORE_MIN, SCORE_MAX);
}

export function classifyConfidence(convictionScore: number): DecisionConfidence {
  if (convictionScore >= CONVICTION_THRESHOLDS.HIGH) return "HIGH";
  if (convictionScore >= CONVICTION_THRESHOLDS.MODERATE) return "MODERATE";
  return "LOW";
}

export function calculateUrgency(input: DecisionInput, action: DecisionAction): DecisionUrgency {
  // IMMEDIATE: critical stop proximity or very high reversal probability
  if (
    input.positionStopProximityRisk === URGENCY_THRESHOLDS.IMMEDIATE_STOP_PROXIMITY ||
    input.positionReversalProbability >= URGENCY_THRESHOLDS.IMMEDIATE_REVERSAL_PROB
  ) {
    return "IMMEDIATE";
  }

  // TODAY: high stop proximity or elevated reversal probability + EXIT/REDUCE action
  if (
    (input.positionStopProximityRisk === URGENCY_THRESHOLDS.TODAY_STOP_PROXIMITY ||
      input.positionReversalProbability >= URGENCY_THRESHOLDS.TODAY_REVERSAL_PROB) &&
    (action === "EXIT" || action === "REDUCE")
  ) {
    return "TODAY";
  }

  // MONITOR: WATCH action or borderline conditions
  if (action === "WATCH" || input.positionReversalProbability >= 35) {
    return "MONITOR";
  }

  return "NONE";
}
