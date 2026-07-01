/**
 * TIOS Intelligence Engine — Signal Quality Grade
 * Maps a composite score to a letter grade and validates with technicals.
 */

import { SignalQualityGrade } from "./types";
import { QUALITY_GRADE_THRESHOLDS } from "./constants";

export interface QualityResult {
  grade: SignalQualityGrade;
  score: number;
}

/**
 * Derives a quality grade from the composite score.
 * The base score comes from the signal engine, then technical indicators
 * apply penalties/bonuses to fine-tune the grade boundary.
 */
export function calculateQualityGrade(
  baseScore: number,
  adjustedScore: number
): QualityResult {
  const score = Math.round(adjustedScore);

  let grade: SignalQualityGrade;
  if (score >= QUALITY_GRADE_THRESHOLDS.A_PLUS) grade = "A+";
  else if (score >= QUALITY_GRADE_THRESHOLDS.A) grade = "A";
  else if (score >= QUALITY_GRADE_THRESHOLDS.B_PLUS) grade = "B+";
  else if (score >= QUALITY_GRADE_THRESHOLDS.B) grade = "B";
  else if (score >= QUALITY_GRADE_THRESHOLDS.C) grade = "C";
  else grade = "D";

  return { grade, score };
}
