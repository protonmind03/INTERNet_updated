import type { Pool } from "pg";
import { phClock } from "./phTime";
import { keptProjectionsFor } from "./projection";
import { bindFilters, filterConditions, filterOfStudent, type StudentFilters } from "./studentScope";

/*
|--------------------------------------------------------------------------
| THE COORDINATOR'S HOME (PSU redesign, Section 11)
|--------------------------------------------------------------------------
|
| What the Home page adds to the action list and the figures it already
| reads: the cohort as a line of trainees between 0 hours and the
| requirement, the open appeals that come first under "Needs you", this
| week's dated things, and a few plain counts. Everything is for the
| students the coordinator's filters leave (services/studentScope.ts).
| Nothing here writes, except the projections a read keeps fresh.
|
|   behind        the projection says they finish after the term ends, or
|                 nothing is scheduled (student_projections.at_risk)
|   almost done   within the last tenth of their required hours, or done
|   on the way    everyone else
|
| This is the one threshold "Behind schedule" uses; it is a rule of the
| projection, not a target anyone sets (DEVELOPING.md).
|
*/

/** Within this share of the requirement, a trainee is "almost done". */
export const ALMOST_DONE_SHARE = 0.1;
/** Stations drawn on the line, at most. */
const STATIONS = 12;

export type CohortState = "behind" | "on-the-way" | "almost-done";

export type CoordinatorHome = {
  week: { number: number; of: number; term: string } | null;
  scope: {
    college: { id: number; name: string; short_name: string | null; mark_key: string | null } | null;
    program: { id: number; name: string; short_code: string; mark_key: string | null; org_name: string | null } | null;
  };
  cohort: {
    total: number;
    behind: number;
    on_the_way: number;
    almost_done: number;
    /** The requirement most trainees have, for the line's end. */
    required: number;
    stations: { student_id: string; name: string; hours: number; required: number; state: CohortState }[];
  };
  appeals: { count: number; oldest_days: number; kinds: string[]; names: string[] };
  this_week: { date: string; kind: "deliverable" | "visit" | "holiday" | "term"; title: string; line: string; link: string }[];
  absences_week: { filed: number; half_days: number };
  evaluations: { done: number; of: number };
};

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export function stateOf(row: { required: number; hours: number; at_risk: boolean }): CohortState {
  const left = Math.max(0, row.required - row.hours);
  if (row.required > 0 && left <= row.required * ALMOST_DONE_SHARE) return "almost-done";
  if (row.at_risk) return "behind";
  return "on-the-way";
}

/** Up to STATIONS trainees spread along the line: everyone behind first, then evenly by hours. */
export function pickStations<T extends { hours: number; state: CohortState }>(rows: T[]): T[] {
  const sorted = [...rows].sort((a, b) => a.hours - b.hours);
  const behind = sorted.filter((row) => row.state === "behind").slice(0, Math.ceil(STATIONS / 3));
  const rest = sorted.filter((row) => !behind.includes(row));
  const room = STATIONS - behind.length;
  const spread = rest.length <= room ? rest : Array.from({ length: room }, (_, index) => rest[Math.round((index * (rest.length - 1)) / Math.max(1, room - 1))]);
  return [...new Set([...behind, ...spread])].sort((a, b) => a.hours - b.hours);
}

export async function coordinatorHome(pool: Pool, filters: StudentFilters, now: Date = new Date()): Promise<CoordinatorHome> {
  const today = phClock(now).date;
  const run = <Row extends Record<string, unknown>>(sql: string, params: unknown[] = []) => {
    const bound = bindFilters(sql, params, filters);
    return pool.query<Row>(bound.text, bound.values);
  };
  // The projections are worked out first when today's are missing.
  await keptProjectionsFor(pool, { filters }, now);
  const weekEnd = addDays(today, 7);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = addDays(today, -((weekday + 6) % 7));

  const [term, college, program, cohort, appeals, deliverables, visits, holidays, absences, evaluations] = await Promise.all([
    filters.term && filters.term !== "none"
      ? pool.query<{ name: string; start: string; end: string }>(`SELECT name, TO_CHAR(start_date, 'YYYY-MM-DD') AS start, TO_CHAR(end_date, 'YYYY-MM-DD') AS "end" FROM terms WHERE id = $1`, [Number(filters.term)])
      : pool.query<{ name: string; start: string; end: string }>(
          `SELECT name, TO_CHAR(start_date, 'YYYY-MM-DD') AS start, TO_CHAR(end_date, 'YYYY-MM-DD') AS "end"
           FROM terms WHERE NOT is_closed AND start_date <= $1::date AND end_date >= $1::date ORDER BY start_date DESC LIMIT 1`,
          [today]
        ),
    filters.college !== undefined
      ? pool.query(`SELECT id, name, short_name, mark_key FROM colleges WHERE id = $1`, [filters.college])
      : Promise.resolve({ rows: [] }),
    filters.program !== undefined
      ? pool.query(`SELECT id, name, short_code, mark_key, org_name FROM programs WHERE id = $1`, [filters.program])
      : Promise.resolve({ rows: [] }),
    run<{ student_id: string; name: string; required: number; hours: number; at_risk: boolean }>(
      `SELECT s.student_id, s.name, COALESCE(sp.required_hours, s.required_hours, 0)::float AS required,
              COALESCE(sp.verified_hours, 0)::float AS hours, COALESCE(sp.at_risk, FALSE) AS at_risk
       FROM students s LEFT JOIN student_projections sp ON sp.student_id = s.student_id
       WHERE s.is_active = TRUE${filterConditions(filters, "s")}`
    ),
    run<{ kind: string; created_at: string; name: string }>(
      `SELECT ap.kind, TO_CHAR(ap.created_at, 'YYYY-MM-DD') AS created_at, s.name
       FROM attendance_appeals ap JOIN students s ON s.student_id = ap.student_id
       WHERE ap.status = 'open'${filterConditions(filters, "s")}
       ORDER BY ap.created_at`
    ),
    pool.query<{ date: string; name: string }>(
      `SELECT TO_CHAR(due_date, 'YYYY-MM-DD') AS date, name FROM ojt_requirements
       WHERE is_active = TRUE AND due_date BETWEEN $1::date AND $2::date ORDER BY due_date`,
      [today, weekEnd]
    ),
    pool.query<{ date: string; company: string | null; by: string }>(
      `SELECT TO_CHAR(v.visit_date, 'YYYY-MM-DD') AS date, c.name AS company, v.visited_by_name AS by
       FROM site_visits v LEFT JOIN companies c ON c.id = v.company_id
       WHERE v.visit_date BETWEEN $1::date AND $2::date ORDER BY v.visit_date`,
      [today, weekEnd]
    ),
    pool.query<{ date: string; name: string }>(
      `SELECT TO_CHAR(holiday_date, 'YYYY-MM-DD') AS date, name FROM holidays WHERE holiday_date BETWEEN $1::date AND $2::date ORDER BY holiday_date`,
      [today, weekEnd]
    ),
    run<{ filed: number; half_days: number }>(
      `SELECT COUNT(*)::int AS filed, COUNT(*) FILTER (WHERE part IN ('am', 'pm'))::int AS half_days
       FROM absences a WHERE a.date BETWEEN $1::date AND ($1::date + 6)${filterOfStudent(filters, "a.student_id")}`,
      [monday]
    ),
    run<{ done: number }>(
      `SELECT COUNT(DISTINCT fe.student_id)::int AS done FROM final_evaluations fe
       JOIN students s ON s.student_id = fe.student_id
       WHERE s.is_active = TRUE${filterConditions(filters, "s")}`
    ),
  ]);

  const rows = cohort.rows.map((row) => ({ ...row, state: stateOf(row) }));
  const requiredCounts = new Map<number, number>();
  for (const row of rows) requiredCounts.set(row.required, (requiredCounts.get(row.required) ?? 0) + 1);
  const required = [...requiredCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const termRow = term.rows[0];
  const week = termRow
    ? { number: Math.max(1, Math.min(Math.ceil((daysBetween(termRow.start, termRow.end) + 1) / 7), Math.floor(daysBetween(termRow.start, today) / 7) + 1)), of: Math.ceil((daysBetween(termRow.start, termRow.end) + 1) / 7), term: termRow.name }
    : null;

  const thisWeek: CoordinatorHome["this_week"] = [
    ...deliverables.rows.map((row) => ({ date: row.date, kind: "deliverable" as const, title: `${row.name} due`, line: "Deliverable", link: "/coordinator/documents?tab=requirements" })),
    ...visits.rows.map((row) => ({ date: row.date, kind: "visit" as const, title: `Site visit${row.company ? ` · ${row.company}` : ""}`, line: `By ${row.by}`, link: "/coordinator/site-visits" })),
    ...holidays.rows.map((row) => ({ date: row.date, kind: "holiday" as const, title: `Holiday · ${row.name}`, line: "Not counted in schedules", link: "/coordinator/holidays" })),
    ...(termRow && termRow.end >= today && termRow.end <= weekEnd ? [{ date: termRow.end, kind: "term" as const, title: `${termRow.name} ends`, line: "Last day of the term", link: "/coordinator/terms" }] : []),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return {
    week,
    scope: { college: (college.rows[0] as CoordinatorHome["scope"]["college"]) ?? null, program: (program.rows[0] as CoordinatorHome["scope"]["program"]) ?? null },
    cohort: {
      total: rows.length,
      behind: rows.filter((row) => row.state === "behind").length,
      on_the_way: rows.filter((row) => row.state === "on-the-way").length,
      almost_done: rows.filter((row) => row.state === "almost-done").length,
      required,
      stations: pickStations(rows).map((row) => ({ student_id: row.student_id, name: row.name, hours: row.hours, required: row.required, state: row.state })),
    },
    appeals: {
      count: appeals.rows.length,
      oldest_days: appeals.rows[0] ? Math.max(0, daysBetween(appeals.rows[0].created_at, today)) : 0,
      kinds: [...new Set(appeals.rows.map((row) => row.kind))],
      names: [...new Set(appeals.rows.map((row) => row.name))].slice(0, 3),
    },
    this_week: thisWeek,
    absences_week: absences.rows[0] ?? { filed: 0, half_days: 0 },
    evaluations: { done: evaluations.rows[0]?.done ?? 0, of: rows.length },
  };
}
