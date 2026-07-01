/**
 * TIOS Intelligence Engine — Signal Module Types
 */

import { IntelligenceResult } from "../shared/types";

export type SignalQualityGrade = "A+" | "A" | "B+" | "B" | "C" | "D";
export type EntryQuality = "OPTIMAL" | "GOOD" | "ACCEPTABLE" | "LATE" | "RISKY";
export type SignalRiskLevel = "LOW" | "MODERATE" | "HIGH" | "EXTREME";

export interface SignalIntelligenceInput {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT" | "-";
  price: number;
  /** Overall quality score 0-100 from the signal engine */
  score: number;
  /** RSI value at signal time */
  rsi: number | null;
  /** MACD histogram value */
  macdHist: number | null;
  /** Distance from EMA in ATR units */
  distAtr: number | null;
  /** EMA slope percentage */
  slopePct: number | null;
  /** Quality band label from signal engine */
  qualityBand: string;
  /** Decision made: OPENED, ACCEPTED, REJECTED */
  decisionGroup: "OPENED" | "ACCEPTED" | "REJECTED" | "PENDING";
  strategy: string;
  timeframe: string;
}

export interface SignalMetrics {
  /** Overall signal quality grade */
  qualityGrade: SignalQualityGrade;
  /** 0-100 composite quality score */
  qualityScore: number;
  /** AI confidence in this signal 0-100 */
  aiConfidence: number;
  /** Risk score for this signal 0-100 (higher = riskier) */
  riskScore: number;
  /** How well signal aligns with trend 0-100 */
  trendScore: number;
  /** Momentum strength at signal time 0-100 */
  momentumScore: number;
  /** Entry timing quality */
  entryQuality: EntryQuality;
  /** Risk classification */
  riskLevel: SignalRiskLevel;
  /** One-line intelligence summary */
  summary: string;
}

export type SignalContext = IntelligenceResult<SignalMetrics>;
