/**
 * TIOS Intelligence Engine — Risk Regime
 * Maps a market score to a RiskRegime label.
 */

import { RiskRegime } from "../shared/types";
import { RISK_REGIME_THRESHOLDS } from "./constants";

/**
 * Derives a RiskRegime from a 0–100 market score.
 * Thresholds are defined in constants — no magic numbers here.
 */
export function mapScoreToRiskRegime(score: number): RiskRegime {
  if (score >= RISK_REGIME_THRESHOLDS.RISK_ON) return "RISK_ON";
  if (score >= RISK_REGIME_THRESHOLDS.SELECTIVE_LONG) return "SELECTIVE_LONG";
  if (score >= RISK_REGIME_THRESHOLDS.NEUTRAL) return "NEUTRAL";
  return "RISK_OFF";
}
