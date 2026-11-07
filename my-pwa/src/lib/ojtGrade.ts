import type { FormCriterion } from "./useFinalEvaluation";

/*
| The OJT grade of PSU's Internship Evaluation Form (FM-AA-INT-13), as the
| server works it out (backend services/evaluationGrade.ts): the ratings
| weighed by each competency's share, then grade = points / scale x 50 + 50.
| A form is weighted when every criterion has a weight and they add to 100.
*/

export const TERMINATION_REASONS = [
  "Lack of work only",
  "Violation of company rules",
  "Unfavorable work habits and practices",
  "Altercation on the job",
  "Too many absences and tardiness",
  "Disrespectful to co-trainee or personnel",
  "Does not demonstrate interest and desire to learn",
] as const;

export type Outcome = { employ?: boolean; improve?: boolean; terminated?: string[]; other?: string };

export function isWeighted(criteria: FormCriterion[]): boolean {
  if (criteria.length === 0 || criteria.some((criterion) => typeof criterion.weight !== "number")) return false;
  return Math.abs(criteria.reduce((sum, criterion) => sum + (criterion.weight ?? 0), 0) - 100) < 0.001;
}

export function ojtGrade(criteria: FormCriterion[], ratings: Record<string, number>, scale: number): { points: number; grade: number } | null {
  if (!isWeighted(criteria) || scale <= 0) return null;
  const points = criteria.reduce((sum, criterion) => sum + (ratings[criterion.key] ?? 0) * (criterion.weight ?? 0), 0) / 100;
  return { points: Math.round(points * 100) / 100, grade: Math.round((points / scale) * 50 * 100 + 5000) / 100 };
}

/** The letter the paper form gives each competency: A, B, C… */
export const letterOf = (index: number) => String.fromCharCode(65 + index);
