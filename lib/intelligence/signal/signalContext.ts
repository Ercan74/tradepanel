/**
 * TIOS Intelligence Engine — Signal Context
 * Entry point for single-signal intelligence analysis.
 */

import { SignalIntelligenceInput, SignalContext, SignalMetrics } from "./types";
import { calculateQualityGrade } from "./qualityGrade";
import { calculateTrendScore } from "./trendScore";
import { calculateMomentumScore } from "./momentumScore";
import { calculateEntryQuality, calculateRiskScore, classifyRiskLevel } from "./entryQuality";
import { calculateConfidence, clamp } from "../shared/scoring";
import { SCORE_MIN, SCORE_MAX } from "../shared/constants";
import { CONFIDENCE_MISSING_TECHNICAL_PENALTY, SOURCE_COMPUTED } from "./constants";

const TOTAL_TECHNICAL_FIELDS = 4; // rsi, macdHist, distAtr, slopePct

/**
 * Computes and returns a fully populated SignalContext for a single signal.
 */
export function getSignalContext(input: SignalIntelligenceInput): SignalContext {
  const timestamp = new Date().toISOString();

  const trendScore = calculateTrendScore(input.side, input.rsi, input.slopePct);
  const momentumScore = calculateMomentumScore(input.side, input.macdHist);
  const entryQuality = calculateEntryQuality(input.distAtr, input.rsi, input.side);
  const riskScore = calculateRiskScore(
    input.side,
    input.rsi,
    input.distAtr,
    input.slopePct,
    input.score
  );
  const riskLevel = classifyRiskLevel(riskScore);

  // Adjusted quality score: start from base signal score, then factor in technicals
  const technicalBonus = (trendScore - 50) * 0.2 + (momentumScore - 50) * 0.15;
  const adjustedScore = clamp(input.score + technicalBonus, SCORE_MIN, SCORE_MAX);
  const { grade: qualityGrade, score: qualityScore } = calculateQualityGrade(
    input.score,
    adjustedScore
  );

  // AI confidence: based on technical data completeness + signal score
  const providedTechnicals = [input.rsi, input.macdHist, input.distAtr, input.slopePct]
    .filter((v) => v !== null && v !== undefined).length;

  const confidence = calculateConfidence({
    totalInputs: TOTAL_TECHNICAL_FIELDS,
    providedInputs: providedTechnicals,
    conflictCount: detectConflicts(input),
  });

  const aiConfidence = clamp(
    (confidence + qualityScore) / 2,
    SCORE_MIN,
    SCORE_MAX
  );

  const summary = buildSummary(input, qualityGrade, entryQuality, riskLevel, trendScore);
  const reasons = buildReasons(input, trendScore, momentumScore, entryQuality, riskScore);
  const warnings = buildWarnings(input, riskLevel, entryQuality, qualityGrade);

  const metrics: SignalMetrics = {
    qualityGrade,
    qualityScore,
    aiConfidence,
    riskScore,
    trendScore,
    momentumScore,
    entryQuality,
    riskLevel,
    summary,
  };

  return {
    value: metrics,
    confidence: aiConfidence,
    reasons,
    warnings,
    timestamp,
    sources: [SOURCE_COMPUTED],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectConflicts(input: SignalIntelligenceInput): number {
  let conflicts = 0;

  // Conflict: LONG signal but RSI overbought
  if (input.side === "LONG" && input.rsi !== null && input.rsi > 70) conflicts++;
  // Conflict: SHORT signal but RSI oversold
  if (input.side === "SHORT" && input.rsi !== null && input.rsi < 30) conflicts++;
  // Conflict: LONG signal but slope negative
  if (input.side === "LONG" && input.slopePct !== null && input.slopePct < -0.1) conflicts++;
  // Conflict: SHORT signal but slope positive
  if (input.side === "SHORT" && input.slopePct !== null && input.slopePct > 0.1) conflicts++;

  return conflicts;
}

function buildSummary(
  input: SignalIntelligenceInput,
  grade: string,
  entry: string,
  risk: string,
  trendScore: number
): string {
  const trendLabel = trendScore >= 65 ? "güçlü trend uyumu" : trendScore >= 45 ? "orta trend uyumu" : "zayıf trend uyumu";
  const entryLabel = entry === "OPTIMAL" ? "optimal giriş" : entry === "GOOD" ? "iyi giriş" : entry === "RISKY" ? "riskli giriş" : "geç giriş";
  return `${grade} kalite sinyal — ${trendLabel}, ${entryLabel}. Risk: ${risk}.`;
}

function buildReasons(
  input: SignalIntelligenceInput,
  trendScore: number,
  momentumScore: number,
  entryQuality: string,
  riskScore: number
): string[] {
  const reasons: string[] = [];

  reasons.push(`Sinyal skoru: ${input.score}/100`);
  reasons.push(`Trend uyumu: ${trendScore.toFixed(0)}/100`);
  reasons.push(`Momentum skoru: ${momentumScore.toFixed(0)}/100`);
  reasons.push(`Giriş kalitesi: ${entryQuality}`);

  if (input.rsi !== null) reasons.push(`RSI: ${input.rsi.toFixed(1)}`);
  if (input.slopePct !== null) reasons.push(`EMA eğimi: %${input.slopePct.toFixed(2)}`);
  if (input.distAtr !== null) reasons.push(`EMA mesafesi: ${input.distAtr.toFixed(2)} ATR`);

  return reasons;
}

function buildWarnings(
  input: SignalIntelligenceInput,
  riskLevel: string,
  entryQuality: string,
  grade: string
): string[] {
  const warnings: string[] = [];

  if (riskLevel === "EXTREME") warnings.push("Risk seviyesi kritik — işlem yapılmamalı");
  else if (riskLevel === "HIGH") warnings.push("Yüksek risk sinyali — pozisyon boyutu küçültülmeli");

  if (entryQuality === "RISKY") warnings.push("Giriş riski yüksek — fiyat EMA'dan çok uzaklaşmış");
  else if (entryQuality === "LATE") warnings.push("Geç giriş — hareketin büyük kısmı tamamlanmış olabilir");

  if (input.side === "LONG" && input.rsi !== null && input.rsi > 70)
    warnings.push(`RSI aşırı alım bölgesinde (${input.rsi.toFixed(0)})`);
  if (input.side === "SHORT" && input.rsi !== null && input.rsi < 30)
    warnings.push(`RSI aşırı satım bölgesinde (${input.rsi.toFixed(0)})`);

  if (grade === "D") warnings.push("Sinyal kalitesi çok düşük — bu sinyali gözardı edin");

  return warnings;
}
