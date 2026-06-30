/**
 * TIOS Intelligence Engine — Default / Mock Market Input
 *
 * Used as a placeholder input set while live market data feeds are not yet
 * connected to lib/intelligence. This is the ONLY place mock market score
 * values should live — components must never define mock values inline.
 *
 * ⚠️ Replace with a live data adapter in a future sprint
 *    (e.g. lib/intelligence/global/liveMarketInput.ts backed by Supabase
 *    or a real market data provider).
 */

import { MarketScoreInput } from "../shared/types";

export const DEFAULT_MARKET_INPUT: MarketScoreInput = {
  globalTrendScore: 72,
  breadthScore: 65,
  trendScore: 68,
  volatilityScore: 71,
  currencyScore: 58,
  flowScore: 63,
};
