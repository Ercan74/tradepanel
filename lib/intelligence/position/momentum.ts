/**
 * TIOS Intelligence Engine — Position Momentum
 * Derives momentum signal and score from pnlPct.
 */

import { MomentumSignal } from "./types";
import { MOMENTUM_THRESHOLDS } from "./constants";
import { clamp } from "../shared/scoring";
import { SCORE_MIN, SCORE_MAX } from "../shared/constants";

export interface MomentumResult {
  signal: MomentumSignal;
  score: number; // 0-100, higher = stronger upward momentum
}

/**
 * Maps a pnlPct value to a MomentumSignal and a 0-100 score.
 * Score 50 = flat, >50 = positive momentum, <50 = negative.
 */
export function calculateMomentum(pnlPct: number, side: "LONG" | "SHORT" | "-"): MomentumResult {
  // For SHORT positions, negative pnlPct means price fell = good for SHORT = positive momentum
  const effectivePct = side === "SHORT" ? -pnlPct : pnlPct;

  let signal: MomentumSignal;
  if (effectivePct >= MOMENTUM_THRESHOLDS.STRONG_UP) signal = "STRONG_UP";
  else if (effectivePct >= MOMENTUM_THRESHOLDS.UP) signal = "UP";
  else if (effectivePct <= MOMENTUM_THRESHOLDS.STRONG_DOWN) signal = "STRONG_DOWN";
  else if (effectivePct <= MOMENTUM_THRESHOLDS.DOWN) signal = "DOWN";
  else signal = "FLAT";

  // Score: map [-10, +10] pnlPct range to [0, 100]
  const rawScore = ((effectivePct + 10) / 20) * 100;
  const score = clamp(parseFloat(rawScore.toFixed(1)), SCORE_MIN, SCORE_MAX);

  return { signal, score };
}
