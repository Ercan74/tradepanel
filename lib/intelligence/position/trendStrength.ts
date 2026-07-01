/**
 * TIOS Intelligence Engine — Position Trend Strength
 * Measures how efficiently the position is performing relative to time held.
 */

import { TrendStrength } from "./types";
import { TREND_STRENGTH_THRESHOLDS } from "./constants";

export interface TrendStrengthResult {
  strength: TrendStrength;
  score: number; // 0-100
  gainPerDay: number | null;
}

/**
 * Parses an age string like "2g" (gün/days), "3s" (saat/hours), "14d"
 * into an approximate number of days held.
 */
export function parseAgeToDays(age: string): number | null {
  if (!age || age === "-") return null;

  const lower = age.toLowerCase().trim();

  // Turkish: "2g" = 2 gün (days), "3s" = 3 saat (hours), "45d" = 45 days
  const dayMatch = lower.match(/^(\d+(?:\.\d+)?)\s*(?:g|d|gün|day|days)$/);
  if (dayMatch) return parseFloat(dayMatch[1]);

  const hourMatch = lower.match(/^(\d+(?:\.\d+)?)\s*(?:s|h|saat|hour|hours)$/);
  if (hourMatch) return parseFloat(hourMatch[1]) / 24;

  const minMatch = lower.match(/^(\d+(?:\.\d+)?)\s*(?:m|min|dk|dakika)$/);
  if (minMatch) return parseFloat(minMatch[1]) / (24 * 60);

  // Generic number fallback → assume days
  const numMatch = lower.match(/^(\d+(?:\.\d+)?)$/);
  if (numMatch) return parseFloat(numMatch[1]);

  return null;
}

/**
 * Calculates trend strength from pnlPct and days held.
 * A position gaining 2% in 1 day is STRONG; gaining 2% in 30 days is STALLING.
 */
export function calculateTrendStrength(
  pnlPct: number,
  age: string,
  side: "LONG" | "SHORT" | "-"
): TrendStrengthResult {
  const days = parseAgeToDays(age);
  const effectivePct = side === "SHORT" ? -pnlPct : pnlPct;

  if (days === null || days <= 0) {
    return { strength: "MODERATE", score: 50, gainPerDay: null };
  }

  const gainPerDay = effectivePct / days;

  let strength: TrendStrength;
  let score: number;

  if (gainPerDay >= TREND_STRENGTH_THRESHOLDS.STRONG) {
    strength = "STRONG";
    score = Math.min(100, 70 + gainPerDay * 10);
  } else if (gainPerDay >= TREND_STRENGTH_THRESHOLDS.MODERATE) {
    strength = "MODERATE";
    score = 45 + ((gainPerDay - TREND_STRENGTH_THRESHOLDS.MODERATE) /
      (TREND_STRENGTH_THRESHOLDS.STRONG - TREND_STRENGTH_THRESHOLDS.MODERATE)) * 25;
  } else if (gainPerDay >= TREND_STRENGTH_THRESHOLDS.WEAK) {
    strength = "WEAK";
    score = 25 + ((gainPerDay - TREND_STRENGTH_THRESHOLDS.WEAK) /
      (TREND_STRENGTH_THRESHOLDS.MODERATE - TREND_STRENGTH_THRESHOLDS.WEAK)) * 20;
  } else {
    strength = "STALLING";
    score = Math.max(0, 25 + gainPerDay * 10);
  }

  return {
    strength,
    score: parseFloat(Math.min(100, Math.max(0, score)).toFixed(1)),
    gainPerDay: parseFloat(gainPerDay.toFixed(3)),
  };
}
