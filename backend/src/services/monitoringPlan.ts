import type { Pool } from "pg";
import { phToday } from "./phTime";

/*
|--------------------------------------------------------------------------
| THE MONITORING PLAN (Phase 2.3, migration 087)
|--------------------------------------------------------------------------
|
| A coordinator plans check-ins (a visit, a call or a message check-in) for
| a company or one student there. They live in site_visits with status
| 'planned' until marked done. The day before, the planner is reminded,
| once, by the deadline-reminder loop.
|
*/

export const CHECK_IN_KINDS = ["visit", "call", "message"] as const;
export type CheckInKind = (typeof CHECK_IN_KINDS)[number];

export const KIND_WORDS: Record<CheckInKind, string> = {
  visit: "Visit",
  call: "Call",
  message: "Message check-in",
};

/** Monday and Sunday of the Philippine week holding `day` (YYYY-MM-DD). */
export function weekOf(day: string): { start: string; end: string } {
  const date = new Date(`${day}T00:00:00Z`);
  const fromMonday = (date.getUTCDay() + 6) % 7;
  const start = new Date(date.getTime() - fromMonday * 86_400_000);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

type Writer = (notification: { coordinatorId?: string; title: string; message: string; type: string; link?: string }) => Promise<unknown>;

/** Reminds each planner of tomorrow's check-ins, once each. Safe to run every round. */
export async function remindPlannedCheckIns(pool: Pool, createNotification: Writer, today = phToday()): Promise<number> {
  const due = await pool.query<{ id: number; visited_by: string; kind: CheckInKind; company: string; student: string | null }>(
    `UPDATE site_visits v SET reminded_at = NOW()
     FROM companies c
     WHERE c.id = v.company_id AND v.status = 'planned' AND v.reminded_at IS NULL
       AND v.planned_on = $1::date + 1
     RETURNING v.id, v.visited_by, v.kind, c.name AS company,
               (SELECT s.name FROM students s WHERE s.student_id = v.student_id) AS student`,
    [today]
  );
  for (const row of due.rows) {
    await createNotification({
      coordinatorId: row.visited_by,
      title: "Check-in tomorrow",
      message: `${KIND_WORDS[row.kind] ?? "Check-in"} planned tomorrow: ${row.company}${row.student ? `, about ${row.student}` : ""}.`,
      type: "info",
      link: "/coordinator/monitoring",
    }).catch((error) => console.error("CHECK-IN REMINDER ERROR:", error));
  }
  return due.rows.length;
}
