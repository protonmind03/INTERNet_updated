/*
|--------------------------------------------------------------------------
| THE COORDINATOR'S ACTION LIST
|--------------------------------------------------------------------------
|
| Everything on the dashboard that needs someone to do something, in one
| list, grouped by who has to act: the coordinator, the supervisors, or the
| students. Each row is a count, a short reason and the page that lists
| what was counted.
|
| It is counted here, on the server, so the dashboard does not download
| every student's row to add them up. Four of the rows are the alerts the
| weekly email reports (insights.ts coordinatorAlerts); they are taken from
| that same function, so the list and the email cannot disagree.
|
| The dashboard's other two summaries that used to need every student's
| row are here as well: how far along the students are, and how much each
| supervisor has waiting.
|
| Nothing here writes to the database.
|
*/

import type { Pool } from "pg";
import { manilaClock } from "./digests";
import { MISSED_DAYS_ALERT, MOA_WARNING_DAYS, SLOW_REVIEW_DAYS, coordinatorAlerts } from "./insights";
import { bindFilters, filterConditions, filtersAsQuery, type StudentFilters } from "./studentScope";

export type ActionRow = {
  key: string;
  count: number;
  /** What is counted, worded for the count: "concerns to review". */
  label: string;
  /** Why it matters, or what it is waiting for. */
  reason: string;
  link: string;
  /** Up to three names, for rows that are about particular people or companies. */
  names?: string[];
};

export type ActionGroup = { who: "you" | "supervisors" | "students"; title: string; rows: ActionRow[] };

export type CoordinatorActions = {
  /** Only rows with something to do; a group with none has an empty list. */
  groups: ActionGroup[];
  /** Scheduled to work today, not a holiday, with no log and no filed absence yet. */
  scheduled_not_in: number;
  /** Active students by how far along their required hours they are. */
  progress: { students: number; not_started: number; under_half: number; past_half: number; completed: number };
  /** Supervisors with interns, by how much is waiting on them, most first. */
  supervisor_queues: { supervisor_id: string; name: string; interns: number; logs: number; tasks: number; waiting: number }[];
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const word = (count: number, one: string, many: string) => (count === 1 ? one : many);

/**
 * `flagged` is the SQL condition for a flagged attendance log on alias
 * "a". The rule is the server's own (server.ts) and is passed in so there
 * is one copy of it.
 */
export async function coordinatorActions(
  pool: Pool,
  options: { filters?: StudentFilters; flagged: string },
  now: Date = new Date()
): Promise<CoordinatorActions> {
  const filters = options.filters ?? {};
  const clock = manilaClock(now);
  // The chosen students, written against "s" (services/studentScope.ts).
  const inTerm = `TRUE${filterConditions(filters, "s")}`;
  const run = <Row extends Record<string, unknown>>(sql: string, params: unknown[]) => {
    const bound = bindFilters(sql, params, filters);
    return pool.query<Row>(bound.text, bound.values);
  };

  const [counts, queues, alerts] = await Promise.all([
    run<{
      concerns: number;
      flagged: number;
      unassigned: number;
      pending_logs: number;
      pending_tasks: number;
      overdue_students: number;
      overdue_tasks: number;
      scheduled_not_in: number;
      students: number;
      not_started: number;
      under_half: number;
      past_half: number;
      completed: number;
    }>(
      `
      WITH mine AS (
        SELECT s.student_id, s.supervisor_id, s.required_hours,
          (SELECT COALESCE(SUM(a.hours), 0) FROM attendance a
            WHERE a.student_id = s.student_id AND a.status = 'Verified') AS hours
        FROM students s WHERE s.is_active = TRUE AND ${inTerm}
      ), progress AS (
        SELECT CASE WHEN required_hours > 0
                    THEN LEAST(100, ROUND(hours / required_hours * 100)) ELSE 0 END AS percent
        FROM mine
      )
      SELECT
        (SELECT COUNT(*)::int FROM complaints WHERE status = 'Pending') AS concerns,
        (SELECT COUNT(*)::int FROM attendance a JOIN mine m ON m.student_id = a.student_id
          WHERE ${options.flagged}) AS flagged,
        (SELECT COUNT(*)::int FROM mine m
          WHERE m.supervisor_id IS NULL OR TRIM(m.supervisor_id::text) = '') AS unassigned,
        (SELECT COUNT(*)::int FROM attendance a JOIN mine m ON m.student_id = a.student_id
          WHERE a.status = 'Pending') AS pending_logs,
        (SELECT COUNT(*)::int FROM tasks t JOIN mine m ON m.student_id = t.student_id
          WHERE t.status = 'Submitted') AS pending_tasks,
        (SELECT COUNT(DISTINCT t.student_id)::int FROM tasks t JOIN mine m ON m.student_id = t.student_id
          WHERE t.status IN ('Pending', 'In Progress') AND t.due_date < $1::date) AS overdue_students,
        (SELECT COUNT(*)::int FROM tasks t JOIN mine m ON m.student_id = t.student_id
          WHERE t.status IN ('Pending', 'In Progress') AND t.due_date < $1::date) AS overdue_tasks,
        (SELECT COUNT(*)::int FROM mine m
          WHERE NOT EXISTS (SELECT 1 FROM holidays h WHERE h.holiday_date = $1::date)
            AND EXISTS (SELECT 1 FROM ojt_schedule o
                        WHERE o.student_id = m.student_id AND o.is_active = TRUE
                          AND INITCAP(TRIM(o.day)) = $2 AND COALESCE(o.hours, 0) > 0)
            AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.student_id = m.student_id AND a.date = $1::date)
            AND NOT EXISTS (SELECT 1 FROM absences b WHERE b.student_id = m.student_id AND b.date = $1::date)
        ) AS scheduled_not_in,
        (SELECT COUNT(*)::int FROM progress) AS students,
        (SELECT COUNT(*)::int FROM progress WHERE percent <= 0) AS not_started,
        (SELECT COUNT(*)::int FROM progress WHERE percent > 0 AND percent < 50) AS under_half,
        (SELECT COUNT(*)::int FROM progress WHERE percent >= 50 AND percent < 100) AS past_half,
        (SELECT COUNT(*)::int FROM progress WHERE percent >= 100) AS completed
      `,
      [clock.date, WEEKDAYS[clock.weekday]]
    ),
    run<{ supervisor_id: string; name: string; interns: number; logs: number; tasks: number }>(
      `
      SELECT sup.supervisor_id, sup.name, COUNT(*)::int AS interns,
        COALESCE(SUM((SELECT COUNT(*) FROM attendance a
          WHERE a.student_id = s.student_id AND a.status = 'Pending')), 0)::int AS logs,
        COALESCE(SUM((SELECT COUNT(*) FROM tasks t
          WHERE t.student_id = s.student_id AND t.status = 'Submitted')), 0)::int AS tasks
      FROM students s
      JOIN supervisors sup ON TRIM(sup.supervisor_id::text) = TRIM(s.supervisor_id::text)
      WHERE s.is_active = TRUE AND ${inTerm}
      GROUP BY sup.supervisor_id, sup.name
      `,
      []
    ),
    coordinatorAlerts(pool, now, filters),
  ]);

  const count = counts.rows[0];
  const alert = (key: string) => alerts.find((item) => item.key === key)?.items ?? [];
  const names = (items: { label: string }[]) => items.slice(0, 3).map((item) => item.label);
  // Lists that can be narrowed the same way open already narrowed.
  const carried = filtersAsQuery(filters);
  const withTerm = (path: string) =>
    carried ? `${path}${path.includes("?") ? "&" : "?"}${carried}` : path;

  const slow = alert("slow_supervisors");
  const agreements = alert("moa_expiring");
  const missed = alert("missed_days");
  const risky = alert("at_risk");

  const groups: ActionGroup[] = [
    {
      who: "you",
      title: "You",
      rows: [
        {
          key: "concerns",
          count: count.concerns,
          label: word(count.concerns, "concern to review", "concerns to review"),
          reason: "Reported by a student or supervisor and not yet looked at.",
          link: "/coordinator/complaints",
        },
        {
          key: "flagged_logs",
          count: count.flagged,
          label: word(count.flagged, "flagged attendance log", "flagged attendance logs"),
          reason: "Rejected, missing a time-out, or left unverified for days.",
          link: withTerm("/coordinator/monitoring?scope=attention"),
        },
        {
          key: "unassigned",
          count: count.unassigned,
          label: word(count.unassigned, "student with no supervisor", "students with no supervisor"),
          reason: "They cannot have logs verified or documents reviewed until assigned.",
          link: withTerm("/coordinator/students?filter=unassigned"),
        },
        {
          key: "agreements",
          count: agreements.length,
          label: word(agreements.length, "agreement ending", "agreements ending"),
          reason: `Ended, or ends within ${MOA_WARNING_DAYS} days.`,
          link: "/coordinator/companies",
          names: names(agreements),
        },
      ],
    },
    {
      who: "supervisors",
      title: "Supervisors",
      rows: [
        {
          key: "slow_reviews",
          count: slow.length,
          label: word(slow.length, "supervisor slow to review", "supervisors slow to review"),
          reason: `Something has waited on them more than ${SLOW_REVIEW_DAYS} days.`,
          link: "/coordinator/supervisors",
          names: names(slow),
        },
        {
          key: "pending_logs",
          count: count.pending_logs,
          label: word(count.pending_logs, "attendance log awaiting a supervisor", "attendance logs awaiting supervisors"),
          reason: "Waiting for the assigned supervisor to verify.",
          link: withTerm("/coordinator/monitoring"),
        },
        {
          key: "pending_tasks",
          count: count.pending_tasks,
          label: word(count.pending_tasks, "task submission awaiting a supervisor", "task submissions awaiting supervisors"),
          reason: "Submitted by students and not yet reviewed.",
          link: withTerm("/coordinator/monitoring"),
        },
      ],
    },
    {
      who: "students",
      title: "Students",
      rows: [
        {
          key: "missed_days",
          count: missed.length,
          label: word(missed.length, "student not turning up", "students not turning up"),
          reason: `${MISSED_DAYS_ALERT} or more scheduled days in a row with no attendance and no absence filed.`,
          link: withTerm("/coordinator/monitoring"),
          names: names(missed),
        },
        {
          key: "at_risk",
          count: risky.length,
          label: word(risky.length, "student at risk of finishing late", "students at risk of finishing late"),
          reason: "At their scheduled hours they finish after the term ends, or nothing is scheduled.",
          link: withTerm("/coordinator/monitoring?risk=1"),
          names: names(risky),
        },
        {
          key: "overdue_tasks",
          count: count.overdue_students,
          label: word(count.overdue_students, "student with an overdue task", "students with overdue tasks"),
          reason: `${count.overdue_tasks} ${word(count.overdue_tasks, "task is", "tasks are")} past the due date and not submitted.`,
          link: withTerm("/coordinator/monitoring?scope=attention"),
        },
      ],
    },
  ];

  return {
    groups: groups.map((group) => ({ ...group, rows: group.rows.filter((row) => row.count > 0) })),
    scheduled_not_in: count.scheduled_not_in,
    progress: {
      students: count.students,
      not_started: count.not_started,
      under_half: count.under_half,
      past_half: count.past_half,
      completed: count.completed,
    },
    supervisor_queues: queues.rows
      .map((row) => ({ ...row, waiting: row.logs + row.tasks }))
      .sort((a, b) => b.waiting - a.waiting || a.name.localeCompare(b.name)),
  };
}
