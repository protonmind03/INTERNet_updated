/*
|--------------------------------------------------------------------------
| WHAT A TERM STILL NEEDS BEFORE IT RUNS
|--------------------------------------------------------------------------
|
| Seven lines for the Terms page, each counted from records: nothing here
| is a box someone ticks, so a line cannot say "done" when it is not. Each
| line says what it found and names the page where it is put right.
|
| "The term's students" are the active students placed in the term.
|
*/

import type { Pool } from "pg";

export type SetupLine = {
  key: string;
  label: string;
  done: boolean;
  /** What was counted, in a sentence. */
  detail: string;
  /** The page where it is done. */
  link: string;
};

export type TermSetup = {
  term: { id: number; name: string; start_date: string; end_date: string; is_closed: boolean };
  lines: SetupLine[];
  done: number;
};

/** How long before a term's start a "welcome" announcement still counts as its own. */
export const WELCOME_WITHIN_DAYS = 30;

const people = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The lines, from the counts. Kept apart from the queries so the wording can be tested. */
export function setupLines(termId: number, counts: {
  students: number;
  without_company: number;
  without_supervisor: number;
  without_block: number;
  without_schedule: number;
  companies: number;
  supervisors: number;
  requirements: number;
  form_is_sample: boolean | null;
  welcome_title: string | null;
}): SetupLine[] {
  const none = counts.students === 0;
  const waiting = "No students are in this term yet.";
  // "1 student of 12 has no company record." / "5 students of 12 have no company record."
  const every = (missing: number, done: string, one: string, many: string) =>
    none ? waiting : missing === 0 ? done : `${people(missing, "student", "students")} of ${counts.students} ${missing === 1 ? one : many}.`;
  return [
    {
      key: "companies",
      label: "Companies recorded",
      done: counts.companies > 0 && !none && counts.without_company === 0,
      detail:
        counts.companies === 0
          ? "No company is recorded yet."
          : every(counts.without_company, `Every student is placed with a recorded company (${people(counts.companies, "company", "companies")} on record).`, "has no company record", "have no company record"),
      link: "/coordinator/companies",
    },
    {
      key: "supervisors",
      label: "Supervisors imported",
      done: counts.supervisors > 0 && !none && counts.without_supervisor === 0,
      detail:
        counts.supervisors === 0
          ? "No supervisor account exists yet."
          : every(counts.without_supervisor, `Every student has a supervisor (${people(counts.supervisors, "active supervisor", "active supervisors")}).`, "has no supervisor", "have no supervisor"),
      link: "/coordinator/supervisors",
    },
    {
      key: "students",
      label: "Students imported and in blocks",
      done: !none && counts.without_block === 0,
      detail: every(counts.without_block, `All ${people(counts.students, "student is", "students are")} in a block.`, "is not in a block", "are not in a block"),
      link: `/coordinator/students?term=${termId}`,
    },
    {
      key: "schedules",
      label: "Schedules set",
      done: !none && counts.without_schedule === 0,
      detail: every(counts.without_schedule, "Every student has a weekly schedule.", "has no weekly schedule", "have no weekly schedule"),
      link: "/coordinator/programs",
    },
    {
      key: "requirements",
      label: "Requirements set",
      done: counts.requirements > 0,
      detail:
        counts.requirements === 0
          ? "No requirement is active, so students are asked for nothing."
          : `${people(counts.requirements, "requirement is", "requirements are")} active. Check the list is this term's.`,
      link: "/coordinator/requirements",
    },
    {
      key: "evaluation_form",
      label: "Evaluation form not a sample",
      done: counts.form_is_sample === false,
      detail:
        counts.form_is_sample === null
          ? "There is no final evaluation form."
          : counts.form_is_sample
            ? "The final evaluation form is still the sample. Enter the university's criteria."
            : "The final evaluation form has been set.",
      link: "/coordinator/evaluations",
    },
    {
      key: "welcome",
      label: "Welcome announcement sent",
      done: counts.welcome_title !== null,
      detail:
        counts.welcome_title !== null
          ? `Sent to students: "${counts.welcome_title}".`
          : `No announcement has gone to students since ${WELCOME_WITHIN_DAYS} days before the term starts.`,
      link: "/coordinator/announcements",
    },
  ];
}

export async function termSetup(pool: Pool, termId: number): Promise<TermSetup | null> {
  const term = await pool.query<TermSetup["term"]>(
    `SELECT id, name, TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date, TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date, is_closed
     FROM terms WHERE id = $1`,
    [termId]
  );
  if (term.rows.length === 0) return null;
  const counts = await pool.query<Parameters<typeof setupLines>[1]>(
    `WITH mine AS (SELECT * FROM students s WHERE s.is_active = TRUE AND s.term_id = $1)
     SELECT
       (SELECT COUNT(*)::int FROM mine) AS students,
       (SELECT COUNT(*)::int FROM mine WHERE company_id IS NULL) AS without_company,
       (SELECT COUNT(*)::int FROM mine WHERE supervisor_id IS NULL OR TRIM(supervisor_id::text) = '') AS without_supervisor,
       (SELECT COUNT(*)::int FROM mine WHERE block_id IS NULL) AS without_block,
       (SELECT COUNT(*)::int FROM mine m WHERE NOT EXISTS (
          SELECT 1 FROM ojt_schedule o WHERE o.student_id = m.student_id AND o.is_active = TRUE)) AS without_schedule,
       (SELECT COUNT(*)::int FROM companies WHERE is_active = TRUE) AS companies,
       (SELECT COUNT(*)::int FROM supervisors WHERE is_active = TRUE) AS supervisors,
       (SELECT COUNT(*)::int FROM ojt_requirements WHERE is_active = TRUE) AS requirements,
       (SELECT f.is_sample FROM evaluation_forms f WHERE f.is_active = TRUE ORDER BY f.id DESC LIMIT 1) AS form_is_sample,
       (SELECT a.title FROM announcements a
          WHERE a.audience IN ('students', 'everyone')
            AND a.created_at >= (SELECT start_date FROM terms WHERE id = $1) - make_interval(days => $2::int)
          ORDER BY a.created_at DESC LIMIT 1) AS welcome_title`,
    [termId, WELCOME_WITHIN_DAYS]
  );
  const lines = setupLines(termId, counts.rows[0]);
  return { term: term.rows[0], lines, done: lines.filter((line) => line.done).length };
}
