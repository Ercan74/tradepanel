/**
 * TIOS Intelligence Engine — Decision Action Resolver
 *
 * This is the highest-level intelligence function in TIOS.
 * It applies a layered veto/boost logic — each engine can override
 * lower-priority signals when its conditions are strong enough.
 *
 * Priority order (highest → lowest):
 * 1. Stop proximity veto  — CRITICAL stop = EXIT regardless of anything else
 * 2. Global regime veto   — RISK_OFF market blocks INCREASE
 * 3. Portfolio veto       — Full portfolio blocks INCREASE
 * 4. Reversal veto        — High reversal probability forces REDUCE or EXIT
 * 5. Position signal      — Position engine's own action recommendation
 * 6. Global boost         — RISK_ON market upgrades HOLD→INCREASE if position is strong
 */

import { DecisionInput, DecisionAction } from "./types";
import {
  REGIME_VETO,
  PORTFOLIO_VETO,
  URGENCY_THRESHOLDS,
} from "./constants";

export interface ActionResolutionResult {
  action: DecisionAction;
  primaryReason: string;
  source: "stop_veto" | "regime_veto" | "portfolio_veto" | "reversal_veto" | "position" | "global_boost";
}

/**
 * Resolves the final decision action using layered veto/boost logic.
 */
export function resolveDecisionAction(input: DecisionInput): ActionResolutionResult {

  // --- Layer 1: Stop proximity veto (highest priority) ---
  if (input.positionStopProximityRisk === "CRITICAL") {
    return {
      action: "EXIT",
      primaryReason: "Stop seviyesi kritik yakın — pozisyon kapatılmalı",
      source: "stop_veto",
    };
  }

  // --- Layer 2: Global regime veto ---
  if (input.riskRegime === "RISK_OFF") {
    if (input.pnlPct < 0) {
      return {
        action: "EXIT",
        primaryReason: "RISK_OFF piyasa + zarar eden pozisyon — çıkış önerilir",
        source: "regime_veto",
      };
    }
    if (input.pnlPct > 0) {
      return {
        action: "REDUCE",
        primaryReason: "RISK_OFF piyasa — kârı realize edin, riski azaltın",
        source: "regime_veto",
      };
    }
  }

  // --- Layer 3: Portfolio veto (blocks INCREASE only) ---
  const portfolioBlocksIncrease =
    input.portfolioHeatLevel === PORTFOLIO_VETO.BLOCK_INCREASE_AT_HEAT ||
    input.cashUsagePct >= PORTFOLIO_VETO.BLOCK_INCREASE_CASH_USAGE_PCT;

  // --- Layer 4: Reversal veto ---
  if (input.positionReversalProbability >= URGENCY_THRESHOLDS.IMMEDIATE_REVERSAL_PROB) {
    return {
      action: input.pnlPct >= 0 ? "REDUCE" : "EXIT",
      primaryReason: `Dönüş ihtimali çok yüksek (%${input.positionReversalProbability.toFixed(0)})`,
      source: "reversal_veto",
    };
  }

  // --- Layer 5: Position signal (primary driver) ---
  let action: DecisionAction;

  switch (input.positionAction) {
    case "EXIT":
      action = "EXIT";
      break;
    case "REDUCE":
      action = "REDUCE";
      break;
    case "INCREASE":
      // Apply portfolio veto on INCREASE
      action = portfolioBlocksIncrease ? "HOLD" : "INCREASE";
      break;
    case "WATCH":
      action = "WATCH";
      break;
    case "HOLD":
    default:
      action = "HOLD";
      break;
  }

  // --- Layer 6: Global boost (upgrades HOLD to INCREASE in strong market) ---
  if (
    action === "HOLD" &&
    !portfolioBlocksIncrease &&
    (input.riskRegime === "RISK_ON" || input.riskRegime === "SELECTIVE_LONG") &&
    input.positionMomentumScore >= 60 &&
    input.positionTrendStrengthScore >= 50 &&
    input.positionReversalProbability < 40
  ) {
    return {
      action: "INCREASE",
      primaryReason: `${input.riskRegime} piyasa + güçlü pozisyon sinyali — artırma fırsatı`,
      source: "global_boost",
    };
  }

  const primaryReason = buildPrimaryReason(input, action);
  return { action, primaryReason, source: "position" };
}

function buildPrimaryReason(input: DecisionInput, action: DecisionAction): string {
  switch (action) {
    case "INCREASE":
      return `Momentum güçlü (${input.positionMomentumScore.toFixed(0)}/100), trend devam ediyor`;
    case "REDUCE":
      return `Dönüş riski artıyor (%${input.positionReversalProbability.toFixed(0)}) — kısmi çıkış`;
    case "EXIT":
      return `Stop mesafesi kritik veya çoklu risk sinyali — pozisyon kapatılmalı`;
    case "WATCH":
      return `Çakışan sinyaller — net bir yön yok, yakın izleme gerekiyor`;
    case "HOLD":
    default:
      return `Pozisyon sağlıklı, mevcut stratejiyi koruyun`;
  }
}
