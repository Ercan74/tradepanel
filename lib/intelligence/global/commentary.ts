/**
 * TIOS Intelligence Engine — Commentary Generator
 * Generates deterministic, rule-based commentary from intelligence outputs.
 * No external API calls. No randomness.
 */

import { RiskRegime } from "../shared/types";
import { CONFIDENCE_DISPLAY_THRESHOLDS } from "./constants";

export interface CommentaryInput {
  marketScore: number;
  riskRegime: RiskRegime;
  confidence: number;
  reasons: string[];
  warnings: string[];
}

const REGIME_HEADLINES: Record<RiskRegime, string> = {
  RISK_ON:
    "Piyasalar güçlü bir risk-on ortamında. Geniş katılım ve momentum daha agresif pozisyonlamayı destekliyor.",
  SELECTIVE_LONG:
    "Koşullar seçici long pozisyonlamayı destekliyor. Lider hisseler güçlü ama genel piyasa katılımı henüz teyit edilmedi.",
  NEUTRAL:
    "Piyasa ortamı karışık. Daha net sinyaller gelene kadar dengeli ve temkinli bir yaklaşım uygundur.",
  RISK_OFF:
    "Risk-off koşullar baskın. Sermaye koruması ve defansif pozisyonlama önceliklidir.",
};

const CONFIDENCE_QUALIFIERS: Array<{ above: number; label: string }> = [
  { above: CONFIDENCE_DISPLAY_THRESHOLDS.HIGH, label: "Yüksek güven" },
  { above: CONFIDENCE_DISPLAY_THRESHOLDS.MODERATE, label: "Orta güven" },
  { above: CONFIDENCE_DISPLAY_THRESHOLDS.LOW, label: "Düşük güven" },
  { above: 0, label: "Çok düşük güven — veri yetersiz" },
];

function confidenceQualifier(confidence: number): string {
  for (const q of CONFIDENCE_QUALIFIERS) {
    if (confidence > q.above) return q.label;
  }
  return CONFIDENCE_QUALIFIERS[CONFIDENCE_QUALIFIERS.length - 1].label;
}

/**
 * Generates a rule-based commentary string.
 */
export function generateCommentary(input: CommentaryInput): string {
  const headline = REGIME_HEADLINES[input.riskRegime];
  const qualifier = confidenceQualifier(input.confidence);
  const scoreTag = `Skor: ${input.marketScore.toFixed(1)}/100.`;
  const confidenceTag = `${qualifier} (%${input.confidence.toFixed(0)}).`;

  const warningLine =
    input.warnings.length > 0
      ? ` Not: ${input.warnings.slice(0, 2).join("; ")}.`
      : "";

  return `${headline} ${scoreTag} ${confidenceTag}${warningLine}`.trim();
}
