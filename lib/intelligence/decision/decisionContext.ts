/**
 * TIOS Intelligence Engine — Decision Context
 * The highest-level intelligence function in TIOS.
 * Aggregates Global + Portfolio + Position signals into one actionable decision.
 */

import { DecisionInput, DecisionContext, DecisionMetrics } from "./types";
import { resolveDecisionAction } from "./actionResolver";
import { calculateConviction, classifyConfidence, calculateUrgency } from "./conviction";
import { calculateConfidence } from "../shared/scoring";
import { ENGINE_WEIGHTS, SOURCE_COMPUTED } from "./constants";

/**
 * Produces a fully populated DecisionContext for a single open position.
 *
 * @param input - Aggregated signals from all four intelligence engines.
 * @returns DecisionContext with action, conviction, urgency, and explanations.
 */
export function getDecision(input: DecisionInput): DecisionContext {
  const timestamp = new Date().toISOString();

  const { action, primaryReason, source } = resolveDecisionAction(input);
  const convictionScore = calculateConviction(input, action);
  const confidence = classifyConfidence(convictionScore);
  const urgency = calculateUrgency(input, action);

  const supportingFactors = buildSupportingFactors(input, action, source);
  const riskFactors = buildRiskFactors(input);
  const warnings = buildWarnings(input, action, urgency);
  const reasons = [primaryReason, ...supportingFactors];

  const metrics: DecisionMetrics = {
    action,
    confidence,
    urgency,
    convictionScore,
    primaryReason,
    supportingFactors,
    riskFactors,
    engineWeights: {
      global: ENGINE_WEIGHTS.global,
      portfolio: ENGINE_WEIGHTS.portfolio,
      position: ENGINE_WEIGHTS.position,
    },
  };

  // Input completeness for outer confidence calculation
  const providedInputs = [
    input.riskRegime,
    input.marketScore,
    input.portfolioRiskScore,
    input.positionMomentumScore,
    input.positionReversalProbability,
    input.positionTrendStrengthScore,
  ].filter((v) => v !== null && v !== undefined).length;

  const dataConfidence = calculateConfidence({
    totalInputs: 6,
    providedInputs,
  });

  return {
    value: metrics,
    confidence: Math.round((convictionScore + dataConfidence) / 2),
    reasons,
    warnings,
    timestamp,
    sources: [SOURCE_COMPUTED],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSupportingFactors(
  input: DecisionInput,
  action: string,
  source: string
): string[] {
  const factors: string[] = [];

  factors.push(`Piyasa rejimi: ${input.riskRegime} (skor ${input.marketScore.toFixed(0)})`);
  factors.push(`Portföy ısısı: ${input.portfolioHeatLevel} (risk ${input.portfolioRiskScore.toFixed(0)}/100)`);
  factors.push(`Pozisyon momentum: ${input.positionMomentumScore.toFixed(0)}/100`);

  if (input.positionRiskRewardCurrent !== null) {
    factors.push(`Risk/Ödül: ${input.positionRiskRewardCurrent.toFixed(1)}x`);
  }

  if (source === "global_boost") {
    factors.push(`Global boost uygulandı — ${input.riskRegime} piyasa HOLD → INCREASE yükseltti`);
  } else if (source === "regime_veto") {
    factors.push(`Rejim vetosu uygulandı — ${input.riskRegime} piyasa pozisyon sinyalini geçersiz kıldı`);
  } else if (source === "portfolio_veto") {
    factors.push("Portföy vetosu uygulandı — ısı veya kapasite sınırı aşıldı");
  }

  return factors;
}

function buildRiskFactors(input: DecisionInput): string[] {
  const risks: string[] = [];

  if (input.positionStopProximityRisk === "CRITICAL" || input.positionStopProximityRisk === "HIGH") {
    risks.push(`Stop yakınlık riski: ${input.positionStopProximityRisk}`);
  }
  if (input.positionReversalProbability >= 40) {
    risks.push(`Dönüş ihtimali: %${input.positionReversalProbability.toFixed(0)}`);
  }
  if (input.portfolioHeatLevel === "HIGH" || input.portfolioHeatLevel === "ELEVATED") {
    risks.push(`Portföy ısı seviyesi: ${input.portfolioHeatLevel}`);
  }
  if (input.cashUsagePct >= 85) {
    risks.push(`Sermaye kullanımı yüksek: %${input.cashUsagePct.toFixed(0)}`);
  }

  return risks;
}

function buildWarnings(
  input: DecisionInput,
  action: string,
  urgency: string
): string[] {
  const warnings: string[] = [];

  if (urgency === "IMMEDIATE") {
    warnings.push("ACİL: Bu karar bugün uygulanmalı");
  } else if (urgency === "TODAY") {
    warnings.push("Seans içinde değerlendirilmeli");
  }

  if (input.riskRegime === "RISK_OFF" && action === "INCREASE") {
    warnings.push("RISK_OFF ortamda artırma yapılmamalı — bu öneri portföy sinyalinden geliyor");
  }

  if (input.globalConfidence < 50) {
    warnings.push("Global intelligence güveni düşük — piyasa verisi eksik olabilir");
  }

  return warnings;
}
