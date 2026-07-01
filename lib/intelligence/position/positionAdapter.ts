/**
 * TIOS Intelligence Engine — Position Input Adapter
 * Converts a DashboardCommandCenter PortfolioRow into PositionIntelligenceInput.
 */

import { PositionIntelligenceInput } from "./types";

/**
 * Adapts a PortfolioRow (from DashboardCommandCenter) to the shape
 * expected by the position intelligence engine.
 *
 * This keeps the intelligence layer fully decoupled from the dashboard's
 * internal PortfolioRow type — if PortfolioRow changes, only this file needs updating.
 */
export function toPositionIntelligenceInput(row: {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT" | "-";
  entry: number;
  current: number;
  stop: number;
  tp1: number;
  pnlPct: number;
  pnl: number;
  slDistancePct: number | null;
  age: string;
  score: number;
  allocated: number;
  qty: number;
}): PositionIntelligenceInput {
  return {
    id: row.id,
    symbol: row.symbol,
    side: row.side,
    entry: row.entry,
    current: row.current,
    stop: row.stop,
    tp1: row.tp1,
    pnlPct: row.pnlPct,
    pnl: row.pnl,
    slDistancePct: row.slDistancePct,
    age: row.age,
    score: row.score,
    allocated: row.allocated,
    qty: row.qty,
  };
}
