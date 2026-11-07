/*
|--------------------------------------------------------------------------
| THE OJT GRADE (revisions, November 2026)
|--------------------------------------------------------------------------
|
| PSU's Internship Evaluation Form (FM-AA-INT-13) weighs each competency
| and turns the ratings into a grade out of 100 (migration 074):
|
|   points = sum over the competencies of rating x weight / 100
|   grade  = points / top of the scale x 50 + 50
|
| On a 5-point scale that is the form's "x 10 + 50": all 4s give 90, all 5s
| give 100, all 1s give 60. A form is weighted when every criterion has a
| weight and the weights add up to 100; otherwise there is no grade and the
| average is used, as before.
|
*/

export type GradedCriterion = { key: string; label: string; description: string; weight?: number; levels?: string[] };

/** The reasons on the form for ending an internship early, in its words. */
export const TERMINATION_REASONS = [
  "Lack of work only",
  "Violation of company rules",
  "Unfavorable work habits and practices",
  "Altercation on the job",
  "Too many absences and tardiness",
  "Disrespectful to co-trainee or personnel",
  "Does not demonstrate interest and desire to learn",
] as const;

export function isWeighted(criteria: GradedCriterion[]): boolean {
  if (criteria.length === 0 || criteria.some((criterion) => typeof criterion.weight !== "number")) return false;
  const total = criteria.reduce((sum, criterion) => sum + (criterion.weight ?? 0), 0);
  return Math.abs(total - 100) < 0.001;
}

/** The weighted points (on the scale) and the grade, rounded to hundredths; null when the form is not weighted. */
export function ojtGrade(criteria: GradedCriterion[], ratings: Record<string, number>, scaleMax: number): { points: number; grade: number } | null {
  if (!isWeighted(criteria) || scaleMax <= 0) return null;
  const points = criteria.reduce((sum, criterion) => sum + (ratings[criterion.key] ?? 0) * (criterion.weight ?? 0), 0) / 100;
  return { points: Math.round(points * 100) / 100, grade: Math.round((points / scaleMax) * 50 * 100 + 50 * 100) / 100 };
}

type Problem = { problem: string };

/**
 * A criterion's weight and rating sentences, as the coordinator sends them.
 * Both optional; when sent, the weight is above 0 and at most 100, and there
 * is one sentence for each rating.
 */
export function readGrading(item: Record<string, unknown>, label: string, scaleMax: number): { weight?: number; levels?: string[] } | Problem {
  const out: { weight?: number; levels?: string[] } = {};
  if (item.weight !== undefined && item.weight !== null && item.weight !== "") {
    const weight = Number(item.weight);
    if (!Number.isFinite(weight) || weight <= 0 || weight > 100 || Math.round(weight * 10) !== weight * 10) {
      return { problem: `Give "${label}" a weight above 0 and up to 100 percent.` };
    }
    out.weight = weight;
  }
  if (item.levels !== undefined && item.levels !== null) {
    if (!Array.isArray(item.levels) || item.levels.length !== scaleMax) {
      return { problem: `"${label}" needs one sentence for each rating from 1 to ${scaleMax}.` };
    }
    const levels = item.levels.map((level) => (typeof level === "string" ? level.trim() : ""));
    if (levels.some((level) => level.length < 3 || level.length > 300)) {
      return { problem: `Each rating sentence of "${label}" is 3 to 300 characters.` };
    }
    out.levels = levels;
  }
  return out;
}

/** The boxes at the foot of the form, as the supervisor ticks them. */
export function readOutcome(value: unknown): { employ: boolean; improve: boolean; terminated: string[]; other: string } | Problem {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const terminated = Array.isArray(input.terminated) ? input.terminated.filter((reason): reason is string => typeof reason === "string") : [];
  if (terminated.some((reason) => !(TERMINATION_REASONS as readonly string[]).includes(reason))) {
    return { problem: "One of the reasons for ending the internship is not on the form." };
  }
  const other = typeof input.other === "string" ? input.other.trim() : "";
  if (other.length > 200) return { problem: "Keep the other reason to 200 characters." };
  return { employ: input.employ === true, improve: input.improve === true, terminated, other };
}
