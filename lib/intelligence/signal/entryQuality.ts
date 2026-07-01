/**
 * TIOS Intelligence Engine — Signal Entry Quality & Risk
 */

import { EntryQuality, SignalRiskLevel } from "./types";
import {
  DIST_ATR_THRESHOLDS,
  RSI_THRESHOLDS,
  RISK_LEVEL_THRESHOLDS,
} from "./constants";
import { clamp } from "../shared/scoring";
import { SCORE_MIN, SCORE_MAX } from "../shared/constants";

/**
 * Entry quality: how timely is the signal relative to EMA?
 * distAtr measures how many ATR units the price is from the EMA —
 * the closer to EMA, the fresher the signal.
 */
export function calculateEntryQuality(
  distAtr: number | null,
  rsi: number | null,
  side: "LONG" | "SHORT" | "-"
): EntryQuality {
  if (distAtr === null) return "ACCEPTABLE";

  const absDist = Math.abs(distAtr);

  if (absDist <= DIST_ATR_THRESHOLDS.OPTIMAL) {
    // Close to EMA — check RSI for confirmation
    if (rsi !== null) {
      if (side === "LONG" && rsi > RSI_THRESHOLDS.OVERBOUGHT) return "RISKY";
      if (side === "SHORT" && rsi < RSI_THRESHOLDS.OVERSOLD) return "RISKY";
    }
    return "OPTIMAL";
  }
  if (absDist <= DIST_ATR_THRESHOLDS.GOOD) return "GOOD";
  if (absDist <= DIST_ATR_THRESHOLDS.ACCEPTABLE) return "ACCEPTABLE";
  if (absDist <= DIST_ATR_THRESHOLDS.LATE) return "LATE";
  return "RISKY"; // Too extended from EMA
}

/**
 * Risk score: 0-100. Higher = riskier signal.
 * Combines: overbought/oversold RSI, price extended from EMA, weak trend slope.
 */
export function calculateRiskScore(
  side: "LONG" | "SHORT" | "-",
  rsi: number | null,
  distAtr: number | null,
  slopePct: number | null,
  baseScore: number
): number {
  let risk = 30; // Base risk

  // Low base score = higher risk
  if (baseScore < 50) risk += 25;
  else if (baseScore < 65) risk += 10;
  else if (baseScore > 85) risk -= 10;

  // RSI extremes = higher risk
  if (rsi !== null) {
    if (side === "LONG" && rsi >= RSI_THRESHOLDS.OVERBOUGHT) risk += 25;
    else if (side === "LONG" && rsi >= RSI_THRESHOLDS.OVERBOUGHT_MODERATE) risk += 10;
    else if (side === "SHORT" && rsi <= RSI_THRESHOLDS.OVERSOLD) risk += 25;
    else if (side === "SHORT" && rsi <= RSI_THRESHOLDS.OVERSOLD_MODERATE) risk += 10;
  }

  // Extended from EMA = higher risk (chasing)
  if (distAtr !== null) {
    const absDist = Math.abs(distAtr);
    if (absDist > DIST_ATR_THRESHOLDS.LATE) risk += 20;
    else if (absDist > DIST_ATR_THRESHOLDS.ACCEPTABLE) risk += 10;
  }

  // Against trend slope = higher risk
  if (slopePct !== null) {
    if (side === "LONG" && slopePct < 0) risk += 15;
    else if (side === "SHORT" && slopePct > 0) risk += 15;
  }

  return clamp(risk, SCORE_MIN, SCORE_MAX);
}

export function classifyRiskLevel(riskScore: number): SignalRiskLevel {
  if (riskScore >= RISK_LEVEL_THRESHOLDS.EXTREME) return "EXTREME";
  if (riskScore >= RISK_LEVEL_THRESHOLDS.HIGH) return "HIGH";
  if (riskScore >= RISK_LEVEL_THRESHOLDS.MODERATE) return "MODERATE";
  return "LOW";
}
