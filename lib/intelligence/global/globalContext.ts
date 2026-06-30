/**
 * TIOS Intelligence Engine — Global Context
 * Entry point for the global intelligence calculation.
 * Returns a complete GlobalContext object from market inputs.
 */

import { MarketScoreInput, GlobalContext, RiskRegime } from "../shared/types";
import { calculateMarketScore } from "./marketScore";
import { mapScoreToRiskRegime } from "./riskRegime";
import { computeGlobalConfidence } from "./confidence";
import { generateCommentary } from "./commentary";
import { SOURCE_COMPUTED, SOURCE_FALLBACK_DEFAULTS } from "./constants";

/**
 * Computes and returns a fully populated GlobalContext.
 *
 * @param input - Partial or full market score inputs.
 *                Missing fields are substituted with neutral defaults
 *                and reflected in confidence and warnings.
 */
export function getGlobalContext(input: MarketScoreInput): GlobalContext {
  const timestamp = new Date().toISOString();

  const { score: marketScore, providedInputCount, usedDefaults } =
    calculateMarketScore(input);

  const riskRegime = mapScoreToRiskRegime(marketScore);

  const confidence = computeGlobalConfidence({
    providedInputCount,
    riskRegime,
    marketScore,
  });

  const reasons = buildReasons(input, marketScore, riskRegime);
  const warnings = buildWarnings(usedDefaults, confidence);

  const commentary = generateCommentary({
    marketScore,
    riskRegime,
    confidence,
    reasons,
    warnings,
  });

  const sources: string[] = [
    SOURCE_COMPUTED,
    ...(usedDefaults.length > 0 ? [SOURCE_FALLBACK_DEFAULTS] : []),
  ];

  return {
    marketScore,
    riskRegime,
    confidence,
    commentary,
    reasons,
    warnings,
    timestamp,
    sources,
  };
}

function buildReasons(
  input: MarketScoreInput,
  marketScore: number,
  riskRegime: RiskRegime
): string[] {
  const reasons: string[] = [];

  reasons.push(`Bileşik market skoru: ${marketScore.toFixed(1)}`);
  reasons.push(`Risk rejimi: ${riskRegime}`);

  if (input.globalTrendScore !== undefined) {
    reasons.push(`Global trend skoru: ${input.globalTrendScore}`);
  }
  if (input.breadthScore !== undefined) {
    reasons.push(`Breadth skoru: ${input.breadthScore}`);
  }
  if (input.volatilityScore !== undefined) {
    const vol = input.volatilityScore;
    if (vol < 40) reasons.push("Yüksek volatilite tespit edildi");
    else if (vol > 70) reasons.push("Düşük volatilite — destekleyici ortam");
  }

  return reasons;
}

function buildWarnings(usedDefaults: string[], confidence: number): string[] {
  const warnings: string[] = [];

  if (usedDefaults.length > 0) {
    warnings.push(
      `Eksik girdiler nötr varsayılan değerlerle dolduruldu: ${usedDefaults.join(", ")}`
    );
  }
  if (confidence < 40) {
    warnings.push("Güven seviyesi kritik derecede düşük — güvenilir sinyal için canlı veri gerekli");
  } else if (confidence < 60) {
    warnings.push("Güven seviyesi eşik altında — sinyalleri temkinle değerlendirin");
  }

  return warnings;
}
