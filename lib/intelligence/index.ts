/**
 * TIOS Intelligence Engine — Public API
 * Import all intelligence features from here.
 *
 * Note: global and portfolio modules each define their own SOURCE_COMPUTED
 * constant (scoped to that module's domain). To avoid ambiguous re-export
 * collisions, each module is also available under its own namespace:
 *   import { global, portfolio } from "@/lib/intelligence";
 *   global.SOURCE_COMPUTED / portfolio.SOURCE_COMPUTED
 */

export * from "./global";
export * as portfolio from "./portfolio";
export * from "./shared/types";
export * from "./shared/scoring";
export * from "./shared/constants";

// Explicit re-export of the most commonly used portfolio entry point,
// so callers don't need the namespace for the common case.
export { getPortfolioContext } from "./portfolio/portfolioContext";
export { toPortfolioPositionInputs } from "./portfolio/positionAdapter";
export type {
  PortfolioContextInput,
  PortfolioPositionInput,
  PortfolioContext,
  PortfolioMetrics,
  SectorExposure,
  PortfolioHeatLevel,
} from "./portfolio/types";

// Position Intelligence
export * as positionEngine from "./position";
export { getPositionContext } from "./position/positionContext";
export { toPositionIntelligenceInput } from "./position/positionAdapter";
export type {
  PositionIntelligenceInput,
  PositionContext,
  PositionMetrics,
  SuggestedAction,
  MomentumSignal,
  TrendStrength,
} from "./position/types";

// Signal Intelligence
export * as signalEngine from "./signal";
export { getSignalContext } from "./signal/signalContext";
export type {
  SignalIntelligenceInput,
  SignalContext,
  SignalMetrics,
  SignalQualityGrade,
  EntryQuality,
  SignalRiskLevel,
} from "./signal/types";
