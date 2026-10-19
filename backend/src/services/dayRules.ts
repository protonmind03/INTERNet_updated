/*
|--------------------------------------------------------------------------
| THE DAY'S RULES: WHEN A TIME-IN OPENS, WHAT COUNTS, WHAT IS LATE
|--------------------------------------------------------------------------
|
| Iteration 18 (migration 065). One place for the rules every attendance
| route follows: the camera time-in, the offline time-in, the supervisor's
| in-person time-in, the lunch steps, the steps sent later, and the hours.
| The app is handed the results (opensAt, pmCutoff, late_minutes, ...) and
| never works them out itself.
|
|  1. The shift is the trainee's schedule row for the date (the two-week
|     pattern is respected). Its lunch is the row's own window; with none,
|     a shift that spans noon takes the default (12:00 to 13:00) and one
|     that does not has no lunch.
|  2. A time-in opens early_window_min (30) before the start. Earlier is
|     refused: 409 TOO_EARLY with the time it opens.
|  3. Hours count from the later of the time-in and the start
|     (credited_from), less the lunch taken.
|  4. Late: seconds dropped, a time-in after start + late_grace_min (0) is
|     late; late_minutes is how far after the start (0 on time, NULL when
|     there is no schedule).
|  5. No time-in by the lunch start makes the day afternoon-only (session
|     'pm'): it starts at the lunch end, opens early_window_min before that,
|     a time-in between the lunch start and that opening is TOO_EARLY, there
|     is no lunch, and lateness is measured from the lunch end.
|  6. A shift starting at noon or later is 'pm' from the start (the morning
|     is never absent); one ending by noon is 'am': two steps, no lunch.
|  7. A holiday or an unscheduled day: a time-in at any time, nothing late,
|     session 'full', hours from the time-in (as before).
|  8. Back from lunch after the lunch end is marked (lunch_late_minutes);
|     shown only, as hours already leave lunch out.
|  9. A step sent later is judged at the time it happened, corrected by the
|     phone's measured clock gap.
|
| The judging functions are pure, so the tests check them at exact times.
|
*/

import type { Pool, PoolClient } from "pg";
import { phClock, phMoment } from "./phTime";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type DayRuleSettings = {
  earlyWindowMin: number;
  lateGraceMin: number;
  lateIgnoresSeconds: boolean;
  defaultLunchStart: string;
  defaultLunchEnd: string;
};

export const DEFAULT_DAY_RULES: DayRuleSettings = {
  earlyWindowMin: 30,
  lateGraceMin: 0,
  lateIgnoresSeconds: true,
  defaultLunchStart: "12:00",
  defaultLunchEnd: "13:00",
};

export type Session = "full" | "am" | "pm";

/** One scheduled day, as the schedule row has it ("HH:MM"). */
export type ShiftRow = {
  start: string;
  end: string;
  lunchStart?: string | null;
  lunchEnd?: string | null;
};

/** What a date holds for a trainee, worked out once and handed to the app as it is. */
export type DayPlan = {
  date: string;
  /** "unscheduled" and "holiday" have no rules; the others are the shift's shape. */
  kind: "unscheduled" | "holiday" | Session;
  holiday: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  /** The lunch window ("HH:MM"), or null when the day has none. */
  lunchStart: string | null;
  lunchEnd: string | null;
  /** Whether the lunch window is the schedule's own, not the default. */
  lunchFromSchedule: boolean;
  /** When the morning time-in opens (ISO); null on a day with no rules. */
  opensAt: string | null;
  /** From this moment with no time-in, the day is afternoon-only (ISO); null when it cannot be. */
  pmCutoff: string | null;
  /** When an afternoon-only time-in opens (ISO). */
  pmOpensAt: string | null;
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const NOON = 12 * 60;

const minutesOf = (time: string) => {
  const [hours, minutes] = time.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
};
const timeOf = (minutes: number) => {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, minutes));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
};
const iso = (date: string, time: string) => phMoment(date, time).toISOString();

/** The rule numbers from attendance_rules rows; anything missing or unreadable keeps its default. */
export function readDayRuleSettings(rows: Array<{ key: string; value: string }>): DayRuleSettings {
  const settings = { ...DEFAULT_DAY_RULES };
  for (const { key, value } of rows) {
    const number = Number(value);
    if (key === "early_window_min" && Number.isInteger(number) && number >= 0 && number <= 240) settings.earlyWindowMin = number;
    if (key === "late_grace_min" && Number.isInteger(number) && number >= 0 && number <= 120) settings.lateGraceMin = number;
    if (key === "late_ignores_seconds") settings.lateIgnoresSeconds = value.trim().toLowerCase() !== "false";
    if (key === "default_lunch_start" && HHMM.test(value.trim())) settings.defaultLunchStart = value.trim();
    if (key === "default_lunch_end" && HHMM.test(value.trim())) settings.defaultLunchEnd = value.trim();
  }
  if (minutesOf(settings.defaultLunchEnd) <= minutesOf(settings.defaultLunchStart)) {
    settings.defaultLunchStart = DEFAULT_DAY_RULES.defaultLunchStart;
    settings.defaultLunchEnd = DEFAULT_DAY_RULES.defaultLunchEnd;
  }
  return settings;
}

/** What a date holds: its shift, its lunch, and the moments the rules turn on. */
export function planDay(
  date: string,
  shift: ShiftRow | null,
  holiday: string | null,
  rules: DayRuleSettings = DEFAULT_DAY_RULES
): DayPlan {
  const empty: DayPlan = {
    date,
    kind: holiday ? "holiday" : "unscheduled",
    holiday,
    shiftStart: shift?.start.slice(0, 5) ?? null,
    shiftEnd: shift?.end.slice(0, 5) ?? null,
    lunchStart: null,
    lunchEnd: null,
    lunchFromSchedule: false,
    opensAt: null,
    pmCutoff: null,
    pmOpensAt: null,
  };
  if (holiday || !shift || !HHMM.test(shift.start.slice(0, 5)) || !HHMM.test(shift.end.slice(0, 5))) return empty;

  const start = minutesOf(shift.start);
  const end = minutesOf(shift.end);
  const kind: Session = start >= NOON ? "pm" : end <= NOON ? "am" : "full";

  let lunchStart: number | null = null;
  let lunchEnd: number | null = null;
  const own = Boolean(shift.lunchStart && shift.lunchEnd && HHMM.test(shift.lunchStart.slice(0, 5)) && HHMM.test(shift.lunchEnd.slice(0, 5)));
  if (own) {
    lunchStart = minutesOf(shift.lunchStart!);
    lunchEnd = minutesOf(shift.lunchEnd!);
  } else if (kind === "full") {
    // The default, kept inside the shift.
    lunchStart = Math.max(start, minutesOf(rules.defaultLunchStart));
    lunchEnd = Math.min(end, minutesOf(rules.defaultLunchEnd));
  }
  if (lunchStart !== null && lunchEnd !== null && lunchEnd <= lunchStart) {
    lunchStart = null;
    lunchEnd = null;
  }

  // Only a shift with a morning and an afternoon can lose its morning.
  const canGoPm = kind === "full" && lunchStart !== null && lunchEnd !== null && lunchStart > start;
  return {
    ...empty,
    kind,
    lunchStart: lunchStart === null ? null : timeOf(lunchStart),
    lunchEnd: lunchEnd === null ? null : timeOf(lunchEnd),
    lunchFromSchedule: own && lunchStart !== null,
    opensAt: iso(date, timeOf(start - rules.earlyWindowMin)),
    pmCutoff: canGoPm ? iso(date, timeOf(lunchStart!)) : null,
    pmOpensAt: canGoPm ? iso(date, timeOf(lunchEnd! - rules.earlyWindowMin)) : null,
  };
}

export type TimeInVerdict =
  | {
      ok: true;
      session: Session;
      /** When hours start to count. */
      creditedFrom: Date;
      /** 0 on time; null on a day with no rules. */
      lateMinutes: number | null;
      /** "HH:MM" the time-in was measured against; null on a day with no rules. */
      scheduledStart: string | null;
    }
  | { ok: false; code: "TOO_EARLY"; opensAt: string; message: string };

const clockText = (moment: string) => {
  const [hours, minutes] = phClock(new Date(moment)).time.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
};

/** Minutes after `start` (a moment), by the rule's handling of seconds; never below 0. */
function minutesAfter(at: Date, start: Date, rules: DayRuleSettings): number {
  const ms = at.getTime() - start.getTime();
  if (ms <= 0) return 0;
  return rules.lateIgnoresSeconds ? Math.floor(ms / 60_000) : Math.ceil(ms / 60_000);
}

/**
 * Judges a time-in at `at` (corrected for the phone's clock when it was sent
 * later). `recordedAt` is the time that will be stored, from which the hours
 * count when it is after the start; it is `at` for a live time-in.
 */
export function judgeTimeIn(
  plan: DayPlan,
  at: Date,
  rules: DayRuleSettings = DEFAULT_DAY_RULES,
  recordedAt: Date = at
): TimeInVerdict {
  if (plan.kind === "unscheduled" || plan.kind === "holiday" || !plan.shiftStart || !plan.opensAt) {
    return { ok: true, session: "full", creditedFrom: recordedAt, lateMinutes: null, scheduledStart: null };
  }

  let session: Session = plan.kind;
  let startTime = plan.shiftStart;
  let opensAt = plan.opensAt;
  if (plan.pmCutoff && plan.pmOpensAt && plan.lunchEnd && at.getTime() >= Date.parse(plan.pmCutoff)) {
    session = "pm";
    startTime = plan.lunchEnd;
    opensAt = plan.pmOpensAt;
  }

  if (at.getTime() < Date.parse(opensAt)) {
    return {
      ok: false,
      code: "TOO_EARLY",
      opensAt,
      message:
        session === "pm" && plan.kind === "full"
          ? `The morning has passed. Time in for the afternoon from ${clockText(opensAt)}.`
          : `Time-in opens at ${clockText(opensAt)}, ${rules.earlyWindowMin} minutes before your shift.`,
    };
  }

  const start = phMoment(plan.date, startTime);
  const graced = new Date(start.getTime() + rules.lateGraceMin * 60_000);
  const late = minutesAfter(at, graced, rules) > 0 ? minutesAfter(at, start, rules) : 0;
  return {
    ok: true,
    session,
    creditedFrom: recordedAt.getTime() > start.getTime() ? recordedAt : start,
    lateMinutes: late,
    scheduledStart: startTime,
  };
}

export type LunchVerdict = { ok: true } | { ok: false; code: "NO_LUNCH_ON_PM" | "NO_LUNCH_ON_AM"; message: string };

/**
 * Whether a lunch step may be recorded on a log of this session. A log from
 * before the rules (session NULL), a full day, or a day with no rules may.
 */
export function judgeLunch(session: string | null | undefined, plan: DayPlan | null): LunchVerdict {
  if (session === "pm" && !(plan?.kind === "pm" && plan.lunchFromSchedule)) {
    return {
      ok: false,
      code: "NO_LUNCH_ON_PM",
      message: "An afternoon-only day has no lunch break. Time out when you leave.",
    };
  }
  if (session === "am" && !(plan?.kind === "am" && plan.lunchFromSchedule)) {
    return {
      ok: false,
      code: "NO_LUNCH_ON_AM",
      message: "A morning-only shift has no lunch break. Time out when you leave.",
    };
  }
  return { ok: true };
}

/** Minutes back from lunch after the lunch end (shown only); null when the day has no lunch window. */
export function lunchLateMinutes(plan: DayPlan | null, breakEndAt: Date, rules: DayRuleSettings = DEFAULT_DAY_RULES): number | null {
  if (!plan || !plan.lunchEnd || plan.kind === "unscheduled" || plan.kind === "holiday") return null;
  return minutesAfter(breakEndAt, phMoment(plan.date, plan.lunchEnd), rules);
}

/** A step's time as it really was: the phone's time less its clock gap (positive when the phone ran ahead). */
export function correctedTime(occurredAt: Date, skewSeconds: number | null | undefined): Date {
  return skewSeconds ? new Date(occurredAt.getTime() - skewSeconds * 1000) : occurredAt;
}

/*
| Reading from the database.
*/

const CACHE_MS = 60_000;
let cached: { at: number; settings: DayRuleSettings } | null = null;

/** The rule numbers, read at most once a minute. */
export async function loadDayRuleSettings(db: Queryable, now: number = Date.now()): Promise<DayRuleSettings> {
  if (cached && now - cached.at < CACHE_MS) return cached.settings;
  try {
    const rows = await db.query<{ key: string; value: string }>(`SELECT key, value FROM attendance_rules`);
    cached = { at: now, settings: readDayRuleSettings(rows.rows) };
  } catch (error) {
    // A database before migration 065: the defaults.
    console.error("ATTENDANCE RULES READ ERROR:", error);
    cached = { at: now, settings: { ...DEFAULT_DAY_RULES } };
  }
  return cached.settings;
}

/** Forgets the cached numbers (after the rules are changed, and in tests). */
export function forgetDayRuleSettings(): void {
  cached = null;
}

/** A trainee's plan for a date ("YYYY-MM-DD"): their shift that day, and whether it is a holiday. */
export async function loadDayPlan(db: Queryable, studentId: string, date: string, rules?: DayRuleSettings): Promise<DayPlan> {
  const settings = rules ?? (await loadDayRuleSettings(db));
  const [shift, holiday] = await Promise.all([
    db.query<{ start_time: string | null; end_time: string | null; lunch_start: string | null; lunch_end: string | null }>(
      `SELECT TO_CHAR(MIN(o.start_time), 'HH24:MI') AS start_time,
              TO_CHAR(MAX(o.end_time), 'HH24:MI') AS end_time,
              TO_CHAR(MIN(o.lunch_start), 'HH24:MI') AS lunch_start,
              TO_CHAR(MIN(o.lunch_end), 'HH24:MI') AS lunch_end
       FROM ojt_schedule o
       JOIN students st ON st.student_id = o.student_id
       WHERE o.student_id = $1 AND o.is_active = TRUE
         AND INITCAP(TRIM(o.day)) = TRIM(TO_CHAR($2::date, 'Day'))
         AND COALESCE(o.week, 1) = ojt_pattern_week(st.schedule_anchor, st.schedule_weeks, $2::date)`,
      [studentId, date]
    ),
    db.query<{ name: string }>(`SELECT name FROM holidays WHERE holiday_date = $1::date LIMIT 1`, [date]),
  ]);
  const row = shift.rows[0];
  return planDay(
    date,
    row?.start_time && row.end_time ? { start: row.start_time, end: row.end_time, lunchStart: row.lunch_start, lunchEnd: row.lunch_end } : null,
    holiday.rows[0]?.name ?? null,
    settings
  );
}

/** The plan as the app reads it, beside a log or on its own for today. */
export function planForApp(plan: DayPlan) {
  return {
    date: plan.date,
    kind: plan.kind,
    holiday: plan.holiday,
    shiftStart: plan.shiftStart,
    shiftEnd: plan.shiftEnd,
    lunchStart: plan.lunchStart,
    lunchEnd: plan.lunchEnd,
    opensAt: plan.opensAt,
    pmCutoff: plan.pmCutoff,
    pmOpensAt: plan.pmOpensAt,
  };
}
