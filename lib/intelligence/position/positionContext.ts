/**
 * TIOS Intelligence Engine — Position Context
 * Entry point for single-position intelligence analysis.
 */

import { PositionIntelligenceInput, PositionContext, PositionMetrics } from "./types";
import { calculateMomentum } from "./momentum";
import { calculateTrendStrength, parseAgeToDays } from "./trendStrength";
import { calculateReversalProbability } from "./reversalProbability";
import { calculateSuggestedAction } from "./suggestedAction";
import { calculateConfidence } from "../shared/scoring";
import { clamp } from "../shared/scoring";
import { SCORE_MIN, SCORE_MAX } from "../shared/constants";
import {
  STOP_PROXIMITY_THRESHOLDS,
  SOURCE_COMPUTED,
  POSITION_TOTAL_INPUT_FIELDS,
} from "./constants";

/**
 * Computes and returns a fully populated PositionContext for a single position.
 */
export function getPositionContext(input: PositionIntelligenceInput): PositionContext {
  const timestamp = new Date().toISOString();

  const { signal: momentum, score: momentumScore } = calculateMomentum(
    input.pnlPct,
    input.side
  );

  const { strength: trendStrength, score: trendStrengthScore, gainPerDay } =
    calculateTrendStrength(input.pnlPct, input.age, input.side);

  const holdingDays = parseAgeToDays(input.age);

  // Target progress: how far price has moved toward TP1 (0-100%)
  const targetProgress = calculateTargetProgress(input);

  // Risk/reward at current price
  const riskRewardCurrent = calculateRiskReward(input);

  // Stop proximity risk
  const stopProximityRisk = classifyStopProximity(input.slDistancePct);

  const reversalProbability = calculateReversalProbability({
    pnlPct: input.pnlPct,
    side: input.side,
    slDistancePct: input.slDistancePct,
    targetProgress,
    aiScore: input.score,
    trendStrengthScore,
  });

  const suggestedAction = calculateSuggestedAction({
    momentum,
    trendStrength,
    reversalProbability,
    slDistancePct: input.slDistancePct,
    targetProgress,
    pnlPct: input.pnlPct,
    side: input.side,
  });

  const metrics: PositionMetrics = {
    momentum,
    momentumScore,
    trendStrength,
    trendStrengthScore,
    reversalProbability,
    suggestedAction,
    holdingDays,
    riskRewardCurrent,
    targetProgress,
    stopProximityRisk,
  };

  const providedInputs = countProvidedInputs(input);
  const confidence = calculateConfidence({
    totalInputs: POSITION_TOTAL_INPUT_FIELDS,
    providedInputs,
  });

  const reasons = buildReasons(input, metrics, gainPerDay);
  const warnings = buildWarnings(input, metrics);

  return {
    value: metrics,
    confidence,
    reasons,
    warnings,
    timestamp,
    sources: [SOURCE_COMPUTED],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calculateTargetProgress(input: PositionIntelligenceInput): number | null {
  if (!input.tp1 || !input.entry || input.tp1 === input.entry) return null;

  const totalRange = Math.abs(input.tp1 - input.entry);
  const currentGain =
    input.side === "SHORT"
      ? input.entry - input.current
      : input.current - input.entry;

  const progress = (currentGain / totalRange) * 100;
  return clamp(parseFloat(progress.toFixed(1)), -20, 120);
}

function calculateRiskReward(input: PositionIntelligenceInput): number | null {
  if (!input.stop || !input.tp1 || !input.current) return null;

  const reward = Math.abs(input.tp1 - input.current);
  const risk = Math.abs(input.current - input.stop);

  if (risk === 0) return null;
  return parseFloat((reward / risk).toFixed(2));
}

function classifyStopProximity(
  slDistancePct: number | null
): PositionMetrics["stopProximityRisk"] {
  if (slDistancePct === null) return "LOW";
  if (slDistancePct <= STOP_PROXIMITY_THRESHOLDS.CRITICAL) return "CRITICAL";
  if (slDistancePct <= STOP_PROXIMITY_THRESHOLDS.HIGH) return "HIGH";
  if (slDistancePct <= STOP_PROXIMITY_THRESHOLDS.MODERATE) return "MODERATE";
  return "LOW";
}

function countProvidedInputs(input: PositionIntelligenceInput): number {
  let count = 0;
  if (input.entry > 0) count++;
  if (input.current > 0) count++;
  if (input.stop > 0) count++;
  if (input.tp1 > 0) count++;
  if (input.age && input.age !== "-") count++;
  if (input.score > 0) count++;
  if (input.slDistancePct !== null) count++;
  return count;
}

function buildReasons(
  input: PositionIntelligenceInput,
  metrics: PositionMetrics,
  gainPerDay: number | null
): string[] {
  const reasons: string[] = [];

  reasons.push(`Momentum: ${metrics.momentum} (${metrics.momentumScore.toFixed(0)}/100)`);
  reasons.push(`Trend: ${metrics.trendStrength}`);

  if (gainPerDay !== null) {
    reasons.push(`Günlük kazanç: %${gainPerDay.toFixed(2)}`);
  }
  if (metrics.targetProgress !== null) {
    reasons.push(`Hedefe ilerleme: %${metrics.targetProgress.toFixed(0)}`);
  }
  if (metrics.riskRewardCurrent !== null) {
    reasons.push(`Risk/Ödül: ${metrics.riskRewardCurrent.toFixed(1)}x`);
  }

  return reasons;
}

function buildWarnings(
  input: PositionIntelligenceInput,
  metrics: PositionMetrics
): string[] {
  const warnings: string[] = [];

  if (metrics.stopProximityRisk === "CRITICAL") {
    warnings.push("Stop seviyesi kritik yakın — acil karar gerekebilir");
  } else if (metrics.stopProximityRisk === "HIGH") {
    warnings.push("Stop seviyesine yaklaşılıyor — dikkatli izleme gerekiyor");
  }

  if (metrics.reversalProbability >= 65) {
    warnings.push(`Dönüş ihtimali yüksek (%${metrics.reversalProbability.toFixed(0)})`);
  }

  if (metrics.trendStrength === "STALLING" && input.pnlPct > 0) {
    warnings.push("Trend yavaşlıyor — kâr realizasyonu değerlendirilebilir");
  }

  return warnings;
}
