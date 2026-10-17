import { randomInt } from "node:crypto";

/*
|--------------------------------------------------------------------------
| CAMERA CHECK (LIVENESS): THE SERVER'S RULES
|--------------------------------------------------------------------------
|
| The server picks the prompts for each time-in and later checks that the
| report covers them. There are two levels:
|
|   standard  one or two head turns, chosen at random. No colour test.
|   strict    both head turns and the colour (screen-light) test; when the
|             light test does not clearly pass, a blink is asked as well.
|
| A student is on the strict level from the moment the photo of one of
| their time-ins is rejected ("Reject time-in", services/photoRedo.ts)
| until one of their logs is verified (students.liveness_strict, kept by
| syncLivenessStrict). Rejecting a whole day does not change the level. The check runs on the student's phone, so
| either level is a deterrent, not proof; the supervisor still reviews the
| photo.
|
*/

export const LIVENESS_PROMPTS = ["blink", "smile", "turn-left", "turn-right"] as const;
export type LivenessPrompt = (typeof LIVENESS_PROMPTS)[number];
export type LivenessLevel = "standard" | "strict";

const TURNS: LivenessPrompt[] = ["turn-left", "turn-right"];
/** Asked as well on the strict level when the light test is not conclusive. */
const STRICT_SPARE: LivenessPrompt = "blink";

export function isLivenessPrompt(value: unknown): value is LivenessPrompt {
  return LIVENESS_PROMPTS.includes(value as LivenessPrompt);
}

/** `pick(n)` returns a whole number from 0 to n - 1; tests pass their own. */
export function pickLivenessPrompts(
  level: LivenessLevel,
  pick: (n: number) => number = randomInt
): { prompts: LivenessPrompt[]; spare: LivenessPrompt | null } {
  const order = pick(2) === 0 ? [...TURNS] : [...TURNS].reverse();
  if (level === "strict") return { prompts: order, spare: STRICT_SPARE };
  return { prompts: order.slice(0, pick(2) + 1), spare: null };
}

/**
 * The prompts a report must cover. A ticket from before the levels (it has
 * no `level`) keeps the old rule: the spare is needed unless the light
 * test passed.
 */
export function requiredPrompts(
  /** The ticket's claims: prompts, spare and level are read. */
  claims: Record<string, unknown>,
  flash: "passed" | "inconclusive" | "skipped"
): unknown[] {
  const required: unknown[] = Array.isArray(claims.prompts) ? [...claims.prompts] : [];
  const lightCounts = claims.level === "strict" || claims.level === undefined;
  if (lightCounts && flash !== "passed" && claims.spare) required.push(claims.spare);
  return required;
}

type Queryable = { query: (text: string, values?: unknown[]) => Promise<unknown> };

/**
 * Works the student's level out again from their logs: strict while a
 * time-in photo of theirs was rejected after their latest verification,
 * and that rejection was not overturned on appeal. Run after every decision
 * on a log, so a decision that is withdrawn takes its effect with it.
 */
export async function syncLivenessStrict(db: Queryable, studentId: string): Promise<void> {
  await db.query(
    `UPDATE students s SET liveness_strict = EXISTS (
       SELECT 1 FROM attendance r
       WHERE r.student_id = s.student_id AND r.photo_rejected_at IS NOT NULL
         AND r.photo_rejected_at > COALESCE((
           SELECT MAX(v.verified_at) FROM attendance v
           WHERE v.student_id = s.student_id AND v.status = 'Verified'
         ), '-infinity'::timestamp)
         AND NOT EXISTS (
           SELECT 1 FROM attendance_appeals p
           WHERE p.attendance_id = r.id AND p.kind = 'time_in_rejection' AND p.status = 'overturned'
         )
     )
     WHERE s.student_id = $1`,
    [studentId]
  );
}
