import type { IconName } from "../../../components/Icon";
import { phDateKey } from "../../../lib/format";
import { hoursBetween } from "../scheduleRows";
import { formatPhDay } from "../../../lib/phTime";
import { patternWeek } from "../../../lib/schedulePattern";

/*
|--------------------------------------------------------------------------
| ONE STUDENT'S RECORD, AS DATA
|--------------------------------------------------------------------------
|
| The shapes the record page receives, and the plain functions that read
| them: what kind of day each date was, the weeks of the placement, and
| what is waiting on someone. Nothing here fetches or draws, so it can be
| checked without a browser. Every count the server already gives (the
| performance figures) is used as given; these functions only arrange the
| records the overview already sent.
|
*/

export type Student = {
  student_id: string;
  name: string;
  email: string;
  program: string | null;
  company: string | null;
  required_hours: number;
  /** How the schedule repeats (migration 061); one week when missing. */
  schedule_weeks?: number | null;
  schedule_anchor?: string | null;
  is_active: boolean;
  completed_at: string | null;
  /** When the student asked for a completion review, if they have. */
  completion_requested_at?: string | null;
  supervisor_name: string | null;
  supervisor_active: boolean;
  hours_rendered: number;
  /** Entered by the student on their own profile. */
  phone?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
};

export type Log = {
  id: number;
  date: string;
  time_in: string | null;
  break_time: string | null;
  break_end_time: string | null;
  time_out: string | null;
  hours: number | string | null;
  note: string | null;
  status: string;
  review_notes: string | null;
  /** What the student wrote at time-out about the day's work. */
  accomplishments?: string | null;
  /** How many pictures are attached. Missing from an older server. */
  pictures?: number;
  /** The tasks the student said they worked on that day. */
  tasks?: { id: number; title: string }[];
  /** Set when a supervisor corrected the log's times. */
  time_corrected_at?: string | null;
};

export type Task = {
  id: number;
  title: string;
  priority: string | null;
  status: string;
  due_date: string | null;
  assigned_by: string | null;
  review_notes: string | null;
  review_rating: number | null;
  submitted_at?: string | null;
};

export type Doc = {
  id: number;
  doc_type: string;
  original_filename: string;
  size_bytes: number | string;
  status: "Pending" | "Approved" | "Rejected";
  review_notes: string | null;
  uploaded_at: string;
};

export type Evaluation = {
  id: number;
  evaluator_type: "student" | "supervisor" | "teacher";
  evaluator_name: string | null;
  category: string;
  rating: number;
  comments: string | null;
  created_at: string;
};

export type Absence = {
  id: number;
  date: string;
  reason: string;
  status: "Pending" | "Excused" | "Unexcused";
  review_notes: string | null;
};

export type ScheduleDay = {
  id: number;
  /** Which week of a two-week pattern (Iteration 11); 1 when missing. */
  week?: number | null;
  day: string;
  start_time: string;
  end_time: string;
  focus: string | null;
  hours: number | string | null;
};

export type Journal = {
  id: number;
  week_start: string;
  /** How many pictures are attached. Missing from an older server. */
  pictures?: number;
  activities: string;
  learnings: string;
  challenges: string | null;
  solutions?: string | null;
  status: "Submitted" | "Reviewed" | "Returned";
  review_notes: string | null;
  submitted_at: string;
};

export type Overview = {
  student: Student;
  attendance: Log[];
  tasks: Task[];
  documents: Doc[];
  evaluations: Evaluation[];
  absences: Absence[];
  schedule: ScheduleDay[];
  /** Missing when the answer comes from a server older than the journal. */
  journals?: Journal[];
};

/** A decision the coordinator is making in place of a missing supervisor. */
export type Pending =
  | { kind: "document"; id: number; label: string }
  | { kind: "absence"; id: number; label: string };

/*
|--------------------------------------------------------------------------
| SECTIONS
|--------------------------------------------------------------------------
*/

export type Tab =
  | "overview"
  | "attendance"
  | "schedule"
  | "record"
  | "tasks"
  | "journals"
  | "evaluations"
  | "documents"
  | "notes";

export const TABS: readonly Tab[] = ["overview", "attendance", "schedule", "record", "tasks", "journals", "evaluations", "documents", "notes"];

export type GroupId = "overview" | "time" | "work" | "docs" | "notes";

/**
 * Five groups on the folder's rim, so the top level fits on every screen.
 * A group of more than one section shows them as a second row.
 */
export const GROUPS: readonly { id: GroupId; label: string; icon: IconName; tabs: readonly { tab: Tab; label: string; icon: IconName }[] }[] = [
  { id: "overview", label: "Overview", icon: "activity", tabs: [{ tab: "overview", label: "Overview", icon: "activity" }] },
  {
    id: "time",
    label: "Attendance",
    icon: "clock",
    tabs: [
      { tab: "attendance", label: "Time logs", icon: "clock" },
      { tab: "schedule", label: "Schedule", icon: "calendar" },
      { tab: "record", label: "Time record", icon: "printer" },
    ],
  },
  {
    id: "work",
    label: "Work",
    icon: "tasks",
    tabs: [
      { tab: "tasks", label: "Tasks", icon: "tasks" },
      { tab: "journals", label: "Weekly reports", icon: "note" },
      { tab: "evaluations", label: "Evaluations", icon: "star" },
    ],
  },
  { id: "docs", label: "Documents", icon: "document", tabs: [{ tab: "documents", label: "Documents", icon: "document" }] },
  { id: "notes", label: "Notes", icon: "note", tabs: [{ tab: "notes", label: "Notes", icon: "note" }] },
];

export const groupOf = (tab: Tab) => GROUPS.find((group) => group.tabs.some((item) => item.tab === tab)) ?? GROUPS[0];

/*
|--------------------------------------------------------------------------
| DATES
|--------------------------------------------------------------------------
|
| Dates are "YYYY-MM-DD" keys, read the way the rest of the app reads them
| (the first ten characters). Clock times are minutes after midnight on the
| viewer's clock, the same clock formatTime() shows.
|
*/

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export const dateKey = (value: string | null | undefined) => String(value ?? "").slice(0, 10);
export const todayKey = () => phDateKey(new Date());

function fromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}
export function addDays(key: string, days: number): string {
  const date = fromKey(key);
  date.setDate(date.getDate() + days);
  return phDateKey(date);
}
export const weekdayOf = (key: string) => fromKey(key).getDay();
export const mondayOf = (key: string) => addDays(key, -((weekdayOf(key) + 6) % 7));
export const daysBetween = (from: string, to: string) => Math.round((fromKey(to).getTime() - fromKey(from).getTime()) / 86_400_000);
export const monthOf = (key: string) => key.slice(0, 7);

/** "Sep 21" / "Sep 28 – Oct 2" for Monday to Friday of a week. */
export function weekRange(monday: string): string {
  const start = fromKey(monday);
  const end = fromKey(addDays(monday, 4));
  const month = (key: string) => formatPhDay(key, { month: "short" });
  const last = addDays(monday, 4);
  return start.getMonth() === end.getMonth()
    ? `${month(monday)} ${start.getDate()}–${end.getDate()}`
    : `${month(monday)} ${start.getDate()} – ${month(last)} ${end.getDate()}`;
}

/** Minutes after midnight of a timestamp, on the viewer's clock. */
export function minutesOf(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getHours() * 60 + date.getMinutes();
}
/** Minutes after midnight of a schedule time ("08:00" or "08:00:00"). */
export function clockMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}
/** "8:05 AM" for minutes after midnight. */
export function minutesLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

export const isOpenLog = (log: Log) => !log.time_out;
export const logHours = (log: Log) => Number(log.hours) || 0;
export const oneDecimal = (value: number) => String(Math.round(value * 10) / 10);
export const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/*
|--------------------------------------------------------------------------
| THE SHAPE OF A DAY
|--------------------------------------------------------------------------
*/

export type Shift = { start: string; end: string; hours: number; focus: string | null };

/** The weekly schedule by weekday name (one week of the pattern: `week`, 1 when not given). */
export function shiftsOf(schedule: ScheduleDay[], week = 1): Record<string, Shift> {
  const shifts: Record<string, Shift> = {};
  for (const row of schedule) {
    if ((Number(row.week) || 1) !== week) continue;
    const start = String(row.start_time).slice(0, 5);
    const end = String(row.end_time).slice(0, 5);
    const given = Number(row.hours);
    shifts[row.day] = { start, end, hours: Number.isFinite(given) && given > 0 ? given : hoursBetween(start, end), focus: row.focus };
  }
  return shifts;
}

export type DayKind =
  | "verified"
  | "pending"
  | "rejected"
  | "open"
  | "absent"
  | "unexcused"
  | "holiday"
  | "missed"
  | "planned"
  | "off";

export type DayInfo = {
  date: string;
  log?: Log;
  absence?: Absence;
  holiday?: { date: string; name: string };
  shift?: Shift;
  kind: DayKind;
  /** Minutes after the shift's start, when past the late threshold; otherwise 0. */
  lateMinutes: number;
};

/** Everything the day functions need, worked out once per render. */
export type RecordContext = {
  today: string;
  lateAfter: number;
  /** Week 1's shifts by weekday: the whole schedule for a one-week pattern. */
  shifts: Record<string, Shift>;
  /** Week 2's, for a schedule that repeats every two weeks (Iteration 11). */
  shiftsWeek2: Record<string, Shift>;
  pattern: { weeks: number; anchor: string | null };
  logs: Map<string, Log>;
  absences: Map<string, Absence>;
  holidays: Map<string, { date: string; name: string }>;
  firstLog: string | null;
  completedAt: string | null;
};

export function recordContext(
  data: Overview,
  holidays: { date: string; name: string }[],
  lateAfter: number,
  today = todayKey()
): RecordContext {
  const logs = new Map<string, Log>();
  for (const log of data.attendance) logs.set(dateKey(log.date), log);
  const dates = [...logs.keys()].sort();
  return {
    today,
    lateAfter,
    shifts: shiftsOf(data.schedule, 1),
    shiftsWeek2: shiftsOf(data.schedule, 2),
    pattern: { weeks: Number(data.student.schedule_weeks) || 1, anchor: data.student.schedule_anchor ?? null },
    logs,
    absences: new Map(data.absences.map((item) => [dateKey(item.date), item])),
    holidays: new Map(holidays.map((item) => [dateKey(item.date), item])),
    firstLog: dates[0] ?? null,
    completedAt: data.student.completed_at ? phDateKey(data.student.completed_at) : null,
  };
}

/** The shift of a date: its weekday, in the week of the pattern that date falls in. */
export function shiftOn(ctx: RecordContext, date: string): Shift | undefined {
  const week = patternWeek(ctx.pattern.anchor, ctx.pattern.weeks, date);
  return (week === 2 ? ctx.shiftsWeek2 : ctx.shifts)[WEEKDAYS[weekdayOf(date)]];
}

/** Minutes late for a log, against the schedule as it is now (the server's rule). */
export function lateMinutesOf(ctx: RecordContext, log: Log): number {
  const shift = shiftOn(ctx, dateKey(log.date));
  const arrived = minutesOf(log.time_in);
  if (!shift || arrived === null) return 0;
  const late = arrived - clockMinutes(shift.start);
  return late > ctx.lateAfter ? late : 0;
}

export function dayInfo(ctx: RecordContext, date: string): DayInfo {
  const log = ctx.logs.get(date);
  const absence = ctx.absences.get(date);
  const holiday = ctx.holidays.get(date);
  const weekday = weekdayOf(date);
  const shift = holiday ? undefined : shiftOn(ctx, date);
  let kind: DayKind;
  if (log) kind = isOpenLog(log) ? "open" : log.status === "Verified" ? "verified" : log.status === "Rejected" ? "rejected" : "pending";
  else if (absence) kind = absence.status === "Unexcused" ? "unexcused" : "absent";
  else if (holiday && weekday > 0 && weekday < 6) kind = "holiday";
  else if (!shift || (ctx.firstLog && date < ctx.firstLog) || (ctx.completedAt && date > ctx.completedAt)) kind = "off";
  else kind = date < ctx.today ? "missed" : "planned";
  return { date, log, absence, holiday, shift, kind, lateMinutes: log ? lateMinutesOf(ctx, log) : 0 };
}

/*
|--------------------------------------------------------------------------
| WEEKS
|--------------------------------------------------------------------------
*/

export type Week = {
  n: number;
  start: string;
  end: string;
  future: boolean;
  now: boolean;
  logs: Log[];
  absences: Absence[];
  holidays: { date: string; name: string }[];
  tasks: Task[];
  report?: Journal;
  docs: Doc[];
  evals: Evaluation[];
  verified: number;
  logged: number;
  planned: number;
  issues: { late: number; rejected: number; pending: number; open: number; corrected: number; absPending: number };
  /** Verified hours by the end of this week; for a scheduled week, the projection. */
  cum: number;
  proj: number;
};

/**
 * The weeks from the first time-in to this week, then up to three
 * scheduled weeks while hours remain.
 */
export function buildWeeks(ctx: RecordContext, data: Overview, projectedFinish: string | null): Week[] {
  if (!ctx.firstLog) return [];
  const starts: { start: string; future: boolean }[] = [];
  const thisWeek = mondayOf(ctx.today);
  for (let week = mondayOf(ctx.firstLog); week <= thisWeek; week = addDays(week, 7)) starts.push({ start: week, future: false });
  if (!data.student.completed_at && projectedFinish) {
    const last = mondayOf(dateKey(projectedFinish));
    for (let week = addDays(thisWeek, 7), i = 0; i < 3 && week <= last; week = addDays(week, 7), i += 1) starts.push({ start: week, future: true });
  }
  const journals = data.journals || [];
  let cum = 0;
  let proj = 0;
  return starts.map(({ start, future }, index) => {
    const end = addDays(start, 6);
    const within = (value: string | null | undefined) => {
      const key = dateKey(value);
      return key >= start && key <= end;
    };
    const withinLocal = (value: string | null | undefined) => {
      const key = value ? phDateKey(value) : "";
      return key >= start && key <= end;
    };
    const logs = data.attendance.filter((log) => within(log.date)).sort((a, b) => (dateKey(a.date) < dateKey(b.date) ? -1 : 1));
    const holidays = [...ctx.holidays.values()].filter((item) => within(item.date) && weekdayOf(dateKey(item.date)) % 6 !== 0);
    const planned = Array.from({ length: 7 }, (_, day) => addDays(start, day))
      .filter((date) => !ctx.holidays.has(date))
      .reduce((sum, date) => sum + (shiftOn(ctx, date)?.hours || 0), 0);
    const verified = logs.filter((log) => log.status === "Verified").reduce((sum, log) => sum + logHours(log), 0);
    const absences = data.absences.filter((item) => within(item.date));
    if (!future) {
      cum += verified;
      proj = cum;
    } else proj += planned;
    return {
      n: index + 1,
      start,
      end,
      future,
      now: ctx.today >= start && ctx.today <= end,
      logs,
      absences,
      holidays,
      tasks: data.tasks.filter((task) => within(task.due_date)),
      report: journals.find((item) => dateKey(item.week_start) === start),
      docs: data.documents.filter((doc) => withinLocal(doc.uploaded_at)),
      evals: data.evaluations.filter((item) => withinLocal(item.created_at)),
      verified,
      logged: logs.reduce((sum, log) => sum + logHours(log), 0),
      planned,
      issues: {
        late: logs.filter((log) => lateMinutesOf(ctx, log) > 0).length,
        rejected: logs.filter((log) => log.status === "Rejected").length,
        pending: logs.filter((log) => log.status === "Pending" && !isOpenLog(log)).length,
        open: logs.filter(isOpenLog).length,
        corrected: logs.filter((log) => log.time_corrected_at).length,
        absPending: absences.filter((item) => item.status === "Pending").length,
      },
      cum,
      proj,
    };
  });
}

export const weekNumberOf = (weeks: Week[], date: string) => weeks.find((week) => date >= week.start && date <= week.end)?.n ?? null;

export type Tone = "good" | "waiting" | "bad" | "info" | "neutral";

/** What a week came to, in a few words: the problems first, otherwise whether it met the schedule. */
export function weekStatus(week: Week): { tone: Tone; text: string } {
  if (week.future) return { tone: "neutral", text: `${oneDecimal(week.planned)} h planned` };
  const parts: [Tone, string][] = [];
  const { issues } = week;
  if (issues.rejected) parts.push(["bad", `${issues.rejected} rejected`]);
  const unexcused = week.absences.filter((item) => item.status === "Unexcused").length;
  if (unexcused) parts.push(["bad", `${unexcused} unexcused`]);
  if (issues.absPending) parts.push(["waiting", "absence to decide"]);
  if (issues.pending) parts.push(["waiting", `${issues.pending} to verify`]);
  if (issues.late) parts.push(["waiting", `${issues.late} late`]);
  const excused = week.absences.filter((item) => item.status === "Excused").length;
  if (excused) parts.push(["info", plural(excused, "excused absence", "excused absences")]);
  if (week.now && parts.length === 0) return { tone: "info", text: "In progress" };
  if (parts.length === 0) {
    const short = week.planned - week.logged;
    return short <= 0.5 ? { tone: "good", text: "On schedule" } : { tone: "waiting", text: `${oneDecimal(short)} h short` };
  }
  return { tone: parts[0][0], text: parts.slice(0, 2).map((part) => part[1]).join(" · ") };
}

/*
|--------------------------------------------------------------------------
| WHAT NEEDS ATTENTION
|--------------------------------------------------------------------------
|
| Each item says who has to act, what it is about and since when. The
| coordinator decides documents and absences only when nobody active
| supervises the student, the same rule the page has always had.
|
*/

export type Owner = "you" | "supervisor" | "student";

export type AttentionAction =
  | { kind: "decide"; target: Pending; approveLabel: string; rejectLabel: string }
  | { kind: "open"; tab: Tab; label: string; logFilter?: LogFilter; taskFilter?: TaskFilter; report?: string; section?: "absences" };

export type AttentionItem = {
  key: string;
  owner: Owner;
  tone: Tone;
  icon: IconName;
  topic: string;
  title: string;
  text?: string;
  /** The date it has been waiting since. */
  since?: string;
  /** "Waiting" unless said otherwise ("Overdue"). */
  verb?: string;
  action: AttentionAction;
};

export type LogFilter = "all" | "pending" | "open" | "verified" | "rejected" | "late" | "corrected";
export type TaskFilter = "all" | "open" | "review" | "done" | "overdue";

export const isOpenTask = (task: Task) => task.status === "Pending" || task.status === "In Progress";
export const isOverdueTask = (task: Task, today: string) => isOpenTask(task) && !!task.due_date && dateKey(task.due_date) < today;

export function attentionItems(
  data: Overview,
  ctx: RecordContext,
  weeks: Week[],
  figures: { weeksWorked: number; reportsSubmitted: number } | null,
  canDecide: boolean
): AttentionItem[] {
  const out: AttentionItem[] = [];
  const decider: Owner = canDecide ? "you" : "supervisor";
  const journals = data.journals || [];
  const weekNo = (date: string) => weekNumberOf(weeks, date) ?? "";

  if (data.schedule.length === 0) {
    out.push({
      key: "schedule", owner: "you", tone: "bad", icon: "calendar", topic: "Schedule", title: "No weekly schedule",
      text: "Without one there is no finish date, and attendance on scheduled days can't be counted.",
      action: { kind: "open", tab: "schedule", label: "Set schedule" },
    });
  }
  for (const item of data.absences.filter((absence) => absence.status === "Pending")) {
    const label = `Absence on ${formatPhDay(dateKey(item.date), { weekday: "short", month: "short", day: "numeric" })}`;
    out.push({
      key: `absence-${item.id}`, owner: decider, tone: "waiting", icon: "ban", topic: "Absence", title: `${label} needs a decision`, text: item.reason, since: dateKey(item.date),
      action: canDecide
        ? { kind: "decide", target: { kind: "absence", id: item.id, label }, approveLabel: "Excuse", rejectLabel: "Unexcused" }
        : { kind: "open", tab: "overview", label: "View", section: "absences" },
    });
  }
  for (const doc of data.documents.filter((item) => item.status === "Pending")) {
    out.push({
      key: `document-${doc.id}`, owner: decider, tone: "waiting", icon: "document", topic: "Requirement", title: `${doc.doc_type} needs a decision`, text: doc.original_filename, since: phDateKey(doc.uploaded_at),
      action: canDecide
        ? { kind: "decide", target: { kind: "document", id: doc.id, label: doc.doc_type }, approveLabel: "Approve", rejectLabel: "Reject" }
        : { kind: "open", tab: "documents", label: "View" },
    });
  }
  const toVerify = data.attendance.filter((log) => log.status === "Pending" && !isOpenLog(log)).sort((a, b) => (dateKey(a.date) < dateKey(b.date) ? -1 : 1));
  if (toVerify.length) {
    out.push({
      key: "verify", owner: "supervisor", tone: "waiting", icon: "clock", topic: "Attendance", title: `${plural(toVerify.length, "time log", "time logs")} to verify`,
      text: `${oneDecimal(toVerify.reduce((sum, log) => sum + logHours(log), 0))} h won't count until verified.`, since: dateKey(toVerify[0].date),
      action: { kind: "open", tab: "attendance", label: "Review list", logFilter: "pending" },
    });
  }
  const submitted = data.tasks.filter((task) => task.status === "Submitted");
  if (submitted.length) {
    const since = submitted.map((task) => (task.submitted_at ? phDateKey(task.submitted_at) : "")).filter(Boolean).sort()[0];
    out.push({
      key: "review-tasks", owner: "supervisor", tone: "waiting", icon: "tasks", topic: "Task", title: `${plural(submitted.length, "task", "tasks")} to review`,
      text: submitted.map((task) => task.title).join(", "), since,
      action: { kind: "open", tab: "tasks", label: "View", taskFilter: "review" },
    });
  }
  for (const report of journals.filter((item) => item.status === "Submitted")) {
    out.push({
      key: `report-${report.id}`, owner: "supervisor", tone: "waiting", icon: "note", topic: "Weekly report", title: `Week ${weekNo(dateKey(report.week_start))} report to review`,
      text: report.activities, since: phDateKey(report.submitted_at),
      action: { kind: "open", tab: "journals", label: "Read", report: dateKey(report.week_start) },
    });
  }
  const open = data.attendance.find((log) => isOpenLog(log) && dateKey(log.date) === ctx.today);
  if (open) {
    const minutes = minutesOf(open.time_in);
    out.push({
      key: "open", owner: "student", tone: "info", icon: "clock", topic: "Attendance", title: `Timed in today${minutes !== null ? ` at ${minutesLabel(minutes)}` : ""}, no time-out yet`,
      text: "Today's hours count once the student times out and the log is verified.",
      action: { kind: "open", tab: "attendance", label: "View", logFilter: "open" },
    });
  }
  for (const task of data.tasks.filter((item) => isOverdueTask(item, ctx.today))) {
    out.push({
      key: `task-${task.id}`, owner: "student", tone: "bad", icon: "tasks", topic: "Task", title: `${task.title} is overdue`, since: dateKey(task.due_date), verb: "Overdue",
      action: { kind: "open", tab: "tasks", label: "View", taskFilter: "overdue" },
    });
  }
  for (const report of journals.filter((item) => item.status === "Returned")) {
    out.push({
      key: `returned-${report.id}`, owner: "student", tone: "bad", icon: "note", topic: "Weekly report", title: `Week ${weekNo(dateKey(report.week_start))} report was returned`,
      text: report.review_notes ? `Supervisor: ${report.review_notes}` : undefined,
      action: { kind: "open", tab: "journals", label: "Read", report: dateKey(report.week_start) },
    });
  }
  if (figures) {
    const thisWeekWorked = data.attendance.some((log) => mondayOf(dateKey(log.date)) === mondayOf(ctx.today)) ? 1 : 0;
    const missing = figures.weeksWorked - thisWeekWorked - figures.reportsSubmitted;
    if (missing > 0) {
      out.push({
        key: "missing-reports", owner: "student", tone: "waiting", icon: "note", topic: "Weekly report", title: `${plural(missing, "weekly report", "weekly reports")} not written`,
        text: `${figures.reportsSubmitted} written for ${plural(figures.weeksWorked, "week", "weeks")} worked.`,
        action: { kind: "open", tab: "journals", label: "View" },
      });
    }
  }
  for (const doc of data.documents.filter((item) => item.status === "Rejected")) {
    out.push({
      key: `rejected-doc-${doc.id}`, owner: "student", tone: "bad", icon: "document", topic: "Requirement", title: `${doc.doc_type} needs a new upload`,
      text: doc.review_notes ? `Rejected: ${doc.review_notes}` : "Rejected.", since: phDateKey(doc.uploaded_at),
      action: { kind: "open", tab: "documents", label: "View" },
    });
  }
  const rejected = data.attendance.filter((log) => log.status === "Rejected").sort((a, b) => (dateKey(a.date) < dateKey(b.date) ? -1 : 1));
  if (rejected.length) {
    out.push({
      key: "rejected-logs", owner: "student", tone: "bad", icon: "clock", topic: "Attendance", title: `${plural(rejected.length, "time log was", "time logs were")} rejected`,
      text: rejected[0].review_notes || undefined, since: dateKey(rejected[0].date),
      action: { kind: "open", tab: "attendance", label: "View", logFilter: "rejected" },
    });
  }
  if (data.student.completion_requested_at) {
    out.push({
      key: "completion", owner: "you", tone: "good", icon: "cap", topic: "Completion", title: "Asked for a completion review",
      text: "Check the time record and the final evaluation.", since: phDateKey(data.student.completion_requested_at),
      action: { kind: "open", tab: "record", label: "Time record" },
    });
  }
  return out;
}

/*
|--------------------------------------------------------------------------
| WORDS AND VIEW STATE
|--------------------------------------------------------------------------
*/

export const taskLabel = (status: string) =>
  status === "Pending" ? "Not started" : status === "In Progress" ? "Sent back" : status === "Submitted" ? "To review" : status === "Completed" || status === "Reviewed" ? "Reviewed" : status;
export const taskTone = (status: string): "good" | "waiting" | "info" | "neutral" =>
  status === "Submitted" ? "waiting" : status === "In Progress" ? "info" : status === "Pending" ? "neutral" : "good";
export const reportLabel = (status: string) => (status === "Submitted" ? "Waiting for the supervisor" : status === "Returned" ? "Returned to the student" : "Reviewed");
export const reportTone = (status: string): "good" | "bad" | "waiting" => (status === "Reviewed" ? "good" : status === "Returned" ? "bad" : "waiting");

/** Where the coordinator is on the overview: kept while they visit other sections. */
export type OverviewState = {
  week: string | null;
  day: string | null;
  view: "weeks" | "month";
  month: string | null;
  hidden: string[];
  owner: "all" | Owner;
  showAll: boolean;
  open: { placement: boolean; figures: boolean; absences: boolean };
};

export const initialOverviewState = (): OverviewState => ({
  week: null,
  day: null,
  view: "weeks",
  month: null,
  hidden: [],
  owner: "all",
  showAll: false,
  open: { placement: false, figures: false, absences: false },
});
