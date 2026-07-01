/**
 * TIOS Intelligence Engine — Decision Input Adapter
 *
 * Assembles a DecisionInput from the outputs of the four intelligence engines.
 * This is the "glue" that connects Global + Portfolio + Position engines
 * to the Decision Engine — keeping all five engines fully decoupled.
 */

import { DecisionInput } from "./types";
import { GlobalContext } from "../shared/types";
import { PortfolioMetrics } from "../portfolio/types";
import { PositionMetrics, PositionIntelligenceInput } from "../position/types";

/**
 * Builds a DecisionInput from the outputs of the three lower-level engines.
 */
export function buildDecisionInput(params: {
  positionInput: PositionIntelligenceInput;
  globalContext: GlobalContext;
  portfolioMetrics: PortfolioMetrics;
  positionMetrics: PositionMetrics;
}): DecisionInput {
  const { positionInput, globalContext, portfolioMetrics, positionMetrics } = params;

  return {
    // Position snapshot
    positionId: positionInput.id,
    symbol: positionInput.symbol,
    side: positionInput.side,
    pnlPct: positionInput.pnlPct,
    slDistancePct: positionInput.slDistancePct,
    age: positionInput.age,

    // Global context
    riskRegime: globalContext.riskRegime,
    marketScore: globalContext.marketScore,
    globalConfidence: globalContext.confidence,

    // Portfolio context
    portfolioRiskScore: portfolioMetrics.portfolioRiskScore,
    portfolioHeatLevel: portfolioMetrics.heatLevel,
    cashUsagePct: portfolioMetrics.cashUsagePct,

    // Position intelligence
    positionAction: positionMetrics.suggestedAction,
    positionMomentumScore: positionMetrics.momentumScore,
    positionReversalProbability: positionMetrics.reversalProbability,
    positionStopProximityRisk: positionMetrics.stopProximityRisk,
    positionTrendStrengthScore: positionMetrics.trendStrengthScore,
    positionRiskRewardCurrent: positionMetrics.riskRewardCurrent,
  };
}
