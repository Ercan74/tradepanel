/**
 * TIOS Intelligence Engine — Portfolio Context
 * Entry point for portfolio-level intelligence. Returns a complete
 * IntelligenceResult<PortfolioMetrics> from a list of open positions.
 */

import {
  PortfolioContextInput,
  PortfolioContext,
  PortfolioMetrics,
} from "./types";
import { calculateSectorExposure } from "./sectorExposure";
import { calculateCashUsage } from "./cashUsage";
import { calculateDiversificationScore } from "./diversification";
import { calculateCorrelationScore } from "./correlation";
import { calculatePortfolioHeat } from "./heat";
import { calculatePortfolioRiskScore } from "./portfolioRisk";
import { calculateConfidence } from "../shared/scoring";
import {
  PORTFOLIO_TOTAL_INPUT_FIELDS,
  SOURCE_COMPUTED,
  SOURCE_PARTIAL_SECTOR_DATA,
  UNKNOWN_SECTOR_LABEL,
} from "./constants";

/**
 * Computes and returns a fully populated PortfolioContext.
 *
 * @param input - Open positions and total account capital. Positions
 *                without a `sector` value are grouped under an
 *                "Unknown" sector rather than dropped or causing failure.
 */
export function getPortfolioContext(
  input: PortfolioContextInput
): PortfolioContext {
  const timestamp = new Date().toISOString();
  const { positions, accountCapital } = input;

  const sectorExposure = calculateSectorExposure(positions);
  const cashUsage = calculateCashUsage(positions, accountCapital);
  const diversificationScore = calculateDiversificationScore(sectorExposure);
  const correlationScore = calculateCorrelationScore(positions, sectorExposure);
  const { score: heatScore, level: heatLevel } = calculatePortfolioHeat(
    positions,
    cashUsage.allocated
  );
  const portfolioRiskScore = calculatePortfolioRiskScore({
    heatScore,
    correlationScore,
    diversificationScore,
  });

  const longCount = positions.filter((p) => p.side === "LONG").length;
  const shortCount = positions.length - longCount;

  const missingSectorCount = positions.filter(
    (p) => !p.sector || p.sector.trim() === ""
  ).length;

  const confidence = calculateConfidence({
    totalInputs: PORTFOLIO_TOTAL_INPUT_FIELDS + positions.length,
    providedInputs:
      PORTFOLIO_TOTAL_INPUT_FIELDS + (positions.length - missingSectorCount),
  });

  const metrics: PortfolioMetrics = {
    heatScore,
    heatLevel,
    cashUsagePct: cashUsage.usedPct,
    cashFreePct: cashUsage.freePct,
    diversificationScore,
    correlationScore,
    portfolioRiskScore,
    sectorExposure,
    positionCount: positions.length,
    longCount,
    shortCount,
  };

  const reasons = buildReasons(metrics);
  const warnings = buildWarnings(missingSectorCount, metrics);

  const sources: string[] = [
    SOURCE_COMPUTED,
    ...(missingSectorCount > 0 ? [SOURCE_PARTIAL_SECTOR_DATA] : []),
  ];

  return {
    value: metrics,
    confidence,
    reasons,
    warnings,
    timestamp,
    sources,
  };
}

function buildReasons(metrics: PortfolioMetrics): string[] {
  const reasons: string[] = [];

  reasons.push(`Açık pozisyon sayısı: ${metrics.positionCount}`);
  reasons.push(`Long/Short dağılımı: ${metrics.longCount}/${metrics.shortCount}`);
  reasons.push(`Portföy ısı skoru: ${metrics.heatScore.toFixed(1)} (${metrics.heatLevel})`);
  reasons.push(`Çeşitlendirme skoru: ${metrics.diversificationScore.toFixed(1)}`);

  const topSector = metrics.sectorExposure[0];
  if (topSector) {
    reasons.push(
      `En yoğun sektör: ${topSector.sector} (%${topSector.pct.toFixed(1)})`
    );
  }

  return reasons;
}

function buildWarnings(
  missingSectorCount: number,
  metrics: PortfolioMetrics
): string[] {
  const warnings: string[] = [];

  if (missingSectorCount > 0) {
    warnings.push(
      `${missingSectorCount} pozisyon için sektör verisi henüz mevcut değil — bunlar "${UNKNOWN_SECTOR_LABEL}" altında gruplandı. Canlı Matriks akışına sektör eklendiğinde otomatik düzelecek.`
    );
  }

  if (metrics.heatLevel === "HIGH") {
    warnings.push("Portföy ısısı yüksek — pozisyon konsantrasyonu veya tek yönlü ağırlık riskli seviyede.");
  }

  if (metrics.correlationScore >= 70) {
    warnings.push("Korelasyon riski yüksek tahmin ediliyor — bu tahmin şu an sektör yoğunluğuna dayalı bir proxy, gerçek fiyat korelasyonu değil.");
  }

  return warnings;
}
