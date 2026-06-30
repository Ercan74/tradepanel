/**
 * TIOS Intelligence Engine — Composite Portfolio Risk
 * Combines heat, correlation, and diversification into one score.
 */

import { weightedAverage } from "../shared/scoring";
import { SCORE_MAX } from "../shared/constants";
import { PORTFOLIO_RISK_WEIGHTS } from "./constants";

export interface PortfolioRiskInput {
  heatScore: number;
  correlationScore: number;
  diversificationScore: number;
}

/**
 * Computes the 0–100 composite portfolio risk score. Higher = riskier.
 * Diversification contributes inversely: a highly diversified book
 * lowers the composite risk score.
 */
export function calculatePortfolioRiskScore(input: PortfolioRiskInput): number {
  const diversificationInverse = SCORE_MAX - input.diversificationScore;

  return weightedAverage([
    { value: input.heatScore, weight: PORTFOLIO_RISK_WEIGHTS.heat },
    { value: input.correlationScore, weight: PORTFOLIO_RISK_WEIGHTS.correlation },
    {
      value: diversificationInverse,
      weight: PORTFOLIO_RISK_WEIGHTS.diversificationInverse,
    },
  ]);
}
