/*
|--------------------------------------------------------------------------
| PROGRAMME DELIVERABLES
|--------------------------------------------------------------------------
|
| A requirement is something every student hands in. Since migration 045
| it can also have a due date, be due every week, be reviewed by the
| coordinator instead of the supervisor, and be asked only of some
| programs or blocks. This file holds what those four things mean, so
| every page and every count reads them the same way.
|
|   WHO IT APPLIES TO   everyone when no program and no block is listed;
|                       otherwise a student in one of the listed programs
|                       or blocks.
|   WHEN IT IS DUE      a fixed day; or the end of a numbered week of the
|                       student's term ('week:6'); or every week
|                       ('weekly'), one item a week (deliverable_items).
|   WHO REVIEWS IT      the supervisor unless it says the coordinator.
|
| A WEEKLY deliverable is not one document, so it is not counted among the
| documents a student must have approved to complete their OJT: those are
| the requirements that are not weekly (ONE_OFF below).
|
| The weekly report students already write is its own feature. A weekly
| deliverable that would ask for the same thing again is refused.
|
*/

import type { Pool } from "pg";

/** SQL: requirement `r` (an alias) is asked of student `s` (an alias). */
export const appliesTo = (r: string, s: string) => `(
  (COALESCE(jsonb_array_length(${r}.applies_to->'program_ids'), 0) = 0
   AND COALESCE(jsonb_array_length(${r}.applies_to->'block_ids'), 0) = 0)
  OR COALESCE((${r}.applies_to->'program_ids') @> to_jsonb(${s}.program_id), FALSE)
  OR COALESCE((${r}.applies_to->'block_ids') @> to_jsonb(${s}.block_id), FALSE)
)`;

/** SQL: requirement `r` is a single document, not one a week. */
export const oneOff = (r: string) => `${r}.due_rule IS DISTINCT FROM 'weekly'`;

/** SQL: the day a one-off requirement `r` is due for a student whose term is `t` (both aliases), or NULL. */
export const dueOn = (r: string, t: string) => `COALESCE(
  ${r}.due_date,
  CASE WHEN ${r}.due_rule LIKE 'week:%' AND ${t}.start_date IS NOT NULL
       THEN ${t}.start_date + (SPLIT_PART(${r}.due_rule, ':', 2)::int * 7 - 1) END
)`;

/** SQL: document `d` (an alias) is of a requirement the coordinator reviews. */
export const coordinatorReviews = (d: string) =>
  `EXISTS (SELECT 1 FROM ojt_requirements rq WHERE rq.name = ${d}.doc_type AND rq.reviewer_role = 'coordinator')`;

export type DeliverableSettings = {
  due_date: string | null;
  due_rule: string | null;
  reviewer_role: "supervisor" | "coordinator";
  applies_to: { program_ids: number[]; block_ids: number[] };
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const realDay = (value: string) => DAY.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

function idList(value: unknown): number[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 200) return null;
  if (value.some((item) => !Number.isSafeInteger(item) || (item as number) < 1)) return null;
  return [...new Set(value as number[])].sort((a, b) => a - b);
}

/** True for a name that asks for what the weekly report already is. */
export const duplicatesWeeklyReport = (name: string) => /\bweekly\s+(report|journal)s?\b|\bjournal\b/i.test(name);

/** A requirement's deliverable settings as sent, or what is wrong with them. `name` is the requirement's. */
export function readDeliverable(body: unknown, name: string): { problem: string } | DeliverableSettings {
  const input = (body ?? {}) as Record<string, unknown>;
  const dueDate = input.due_date === undefined || input.due_date === null || input.due_date === "" ? null : input.due_date;
  const dueRule = input.due_rule === undefined || input.due_rule === null || input.due_rule === "" ? null : input.due_rule;
  if (dueDate !== null && (typeof dueDate !== "string" || !realDay(dueDate))) {
    return { problem: "The due date must be a real date (YYYY-MM-DD)." };
  }
  if (dueRule !== null) {
    const week = typeof dueRule === "string" ? /^week:(\d{1,2})$/.exec(dueRule) : null;
    if (dueRule !== "weekly" && !(week && Number(week[1]) >= 1 && Number(week[1]) <= 52)) {
      return { problem: "A deliverable is due on a date, by the end of a week from 1 to 52, or every week." };
    }
  }
  if (dueDate !== null && dueRule !== null) {
    return { problem: "Give a due date or a rule, not both." };
  }
  if (dueRule === "weekly" && duplicatesWeeklyReport(name)) {
    return {
      problem:
        "Students already write a weekly report, which their supervisor reviews. A weekly deliverable for the same thing would ask for it twice.",
    };
  }
  const reviewer = input.reviewer_role === undefined ? "supervisor" : input.reviewer_role;
  if (reviewer !== "supervisor" && reviewer !== "coordinator") {
    return { problem: "A deliverable is reviewed by the supervisor or by the coordinator." };
  }
  const applies = (input.applies_to ?? {}) as Record<string, unknown>;
  if (typeof applies !== "object" || Array.isArray(applies)) return { problem: "That list of programs and blocks is not readable." };
  const programs = idList(applies.program_ids);
  const blocks = idList(applies.block_ids);
  if (!programs || !blocks) return { problem: "That list of programs and blocks is not readable." };
  return {
    due_date: dueDate as string | null,
    due_rule: dueRule as string | null,
    reviewer_role: reviewer,
    applies_to: { program_ids: programs, block_ids: blocks },
  };
}

/** "Due 14 Nov 2026", "Due by the end of week 6 of the term", "Due every week", or "". */
export function dueText(settings: Pick<DeliverableSettings, "due_date" | "due_rule">): string {
  if (settings.due_date) return `Due ${settings.due_date}`;
  if (settings.due_rule === "weekly") return "Due every week";
  const week = /^week:(\d{1,2})$/.exec(settings.due_rule ?? "");
  return week ? `Due by the end of week ${Number(week[1])} of the term` : "";
}

/**
 * Makes the week's item for every student a weekly deliverable is asked
 * of: one per week up to this week (and not past the term's end),
 * starting from the student's term or, if that is later, from the week
 * the deliverable was last saved. So a deliverable made weekly in week
 * ten does not leave nine weeks overdue behind it. A week is Monday to
 * Sunday and is due on its Sunday. Safe to run as often as wanted: a week
 * is made once. Returns how many items were made.
 */
export async function createWeeklyItems(pool: Pool): Promise<number> {
  const made = await pool.query(
    `INSERT INTO deliverable_items (requirement_id, student_id, period_start, due_date)
     SELECT r.id, s.student_id, week::date, week::date + 6
     FROM ojt_requirements r
     JOIN students s ON s.is_active = TRUE AND ${appliesTo("r", "s")}
     JOIN terms t ON t.id = s.term_id AND t.is_closed = FALSE
     CROSS JOIN LATERAL generate_series(
       GREATEST(DATE_TRUNC('week', t.start_date), DATE_TRUNC('week', r.updated_at))::date,
       LEAST(CURRENT_DATE, t.end_date),
       INTERVAL '7 days'
     ) AS week
     WHERE r.is_active = TRUE AND r.due_rule = 'weekly'
     ON CONFLICT (requirement_id, student_id, period_start) DO NOTHING`
  );
  return made.rowCount ?? 0;
}

type Notify = (notification: { studentId?: string; title: string; message: string; type: string }) => Promise<void>;

/**
 * Tells each student once about a deliverable due today or tomorrow that
 * they have not handed in. Each is claimed before it is sent, so a second
 * round, or a restart between rounds, cannot send it twice. Returns how
 * many reminders went out.
 */
export async function sendDeliverableReminders(pool: Pool, notify: Notify): Promise<number> {
  // Weekly items not yet handed in.
  const items = await pool.query<{ student_id: string; name: string; due: string }>(
    `UPDATE deliverable_items i
     SET reminded_at = NOW()
     FROM ojt_requirements r, students s
     WHERE r.id = i.requirement_id AND r.is_active = TRUE AND r.due_rule = 'weekly'
       AND s.student_id = i.student_id AND s.is_active = TRUE
       AND i.reminded_at IS NULL AND i.document_id IS NULL
       AND i.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 1
     RETURNING i.student_id, r.name, TO_CHAR(i.due_date, 'YYYY-MM-DD') AS due`
  );
  // One-off deliverables with a day, with nothing waiting or approved for them.
  const once = await pool.query<{ student_id: string; name: string; due: string }>(
    `INSERT INTO deliverable_reminders (requirement_id, student_id, due_date)
     SELECT r.id, s.student_id, ${dueOn("r", "t")}
     FROM ojt_requirements r
     JOIN students s ON s.is_active = TRUE AND ${appliesTo("r", "s")}
     LEFT JOIN terms t ON t.id = s.term_id
     WHERE r.is_active = TRUE AND ${oneOff("r")}
       AND ${dueOn("r", "t")} BETWEEN CURRENT_DATE AND CURRENT_DATE + 1
       AND NOT EXISTS (
         SELECT 1 FROM documents d
         WHERE d.student_id = s.student_id AND d.doc_type = r.name AND d.status IN ('Pending', 'Approved'))
     ON CONFLICT (requirement_id, student_id, due_date) DO NOTHING
     RETURNING student_id, (SELECT name FROM ojt_requirements WHERE id = requirement_id) AS name,
               TO_CHAR(due_date, 'YYYY-MM-DD') AS due`
  );
  let sent = 0;
  for (const row of [...items.rows, ...once.rows]) {
    try {
      await notify({
        studentId: String(row.student_id),
        title: "Deliverable due",
        message: `"${row.name}" is due on ${row.due}. Upload it from your Documents page.`,
        type: "document",
      });
      sent += 1;
    } catch (error) {
      console.error("DELIVERABLE REMINDER ERROR:", error);
    }
  }
  return sent;
}

/**
 * A document just uploaded for a weekly item: the item now points at it.
 * Nothing happens unless the item is the student's own, of that
 * requirement, and not already approved.
 */
export async function attachItem(
  pool: Pool,
  studentId: string,
  itemId: unknown,
  docType: string,
  documentId: number
): Promise<boolean> {
  if (!/^[0-9]{1,9}$/.test(String(itemId ?? ""))) return false;
  const attached = await pool.query(
    `UPDATE deliverable_items i
     SET document_id = $4, status = 'Submitted'
     FROM ojt_requirements r
     WHERE i.id = $1 AND i.student_id = $2 AND r.id = i.requirement_id AND r.name = $3 AND i.status <> 'Approved'`,
    [Number(itemId), studentId, docType, documentId]
  );
  return (attached.rowCount ?? 0) > 0;
}

/** After a document is reviewed, or a review is withdrawn: its weekly item, if it has one, says the same. */
export async function syncItemWithDocument(pool: Pool, documentId: number): Promise<void> {
  await pool.query(
    `UPDATE deliverable_items i
     SET status = CASE d.status WHEN 'Pending' THEN 'Submitted' ELSE d.status END
     FROM documents d
     WHERE d.id = $1 AND i.document_id = d.id`,
    [documentId]
  );
}
