/**
 * TIOS Intelligence Engine — Portfolio Module Types
 */

import { IntelligenceResult } from "../shared/types";

/**
 * Minimal position shape required for portfolio-level analysis.
 * This is intentionally decoupled from PositionLifecycle (the dashboard's
 * UI-facing type) so the intelligence layer never depends on UI contracts.
 */
export interface PortfolioPositionInput {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT";
  entry: number;
  current: number;
  /** Quantity / lot size. Used to compute allocated capital. */
  qty: number;
  /** Capital allocated to this position. If omitted, derived from entry * qty. */
  allocated?: number;
  /**
   * Sector label for this position. May be null/undefined if the live
   * Matriks feed has not yet populated sector data for this symbol —
   * such positions are grouped under an "Unknown" sector rather than
   * causing a failure.
   */
  sector?: string | null;
}

export interface PortfolioContextInput {
  positions: PortfolioPositionInput[];
  /** Total account capital. Used to compute cash usage. */
  accountCapital: number;
}

export type SectorExposure = {
  sector: string;
  allocated: number;
  pct: number;
  positionCount: number;
};

export type PortfolioHeatLevel = "LOW" | "MODERATE" | "ELEVATED" | "HIGH";

export interface PortfolioMetrics {
  /** 0–100 score reflecting how concentrated the portfolio risk is. Higher = hotter. */
  heatScore: number;
  heatLevel: PortfolioHeatLevel;
  /** % of account capital currently allocated to open positions. */
  cashUsagePct: number;
  /** % of account capital still free. */
  cashFreePct: number;
  /** 0–100 score reflecting how well-diversified the portfolio is. Higher = more diversified. */
  diversificationScore: number;
  /** 0–100 score reflecting estimated correlation risk across positions. Higher = more correlated/risky. */
  correlationScore: number;
  /** 0–100 composite portfolio risk score combining heat, diversification, and correlation. */
  portfolioRiskScore: number;
  sectorExposure: SectorExposure[];
  positionCount: number;
  longCount: number;
  shortCount: number;
}

export type PortfolioContext = IntelligenceResult<PortfolioMetrics>;
