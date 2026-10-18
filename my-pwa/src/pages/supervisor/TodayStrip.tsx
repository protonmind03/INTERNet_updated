import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../../components/Icon";
import { Card, Skeleton } from "../../components/ui";
import { API_URL, withSupervisorAuth } from "../../lib/api";
import { daysUntil, dueLabel, formatHours, formatLongDate, phDateKey } from "../../lib/format";
import { savedFetch } from "../../lib/offlineStore";
import { shiftOn } from "../../lib/studentCalendar";
import {
  WAITING_TOO_LONG_DAYS,
  daysWaiting,
  minuteOfDay,
  todayState,
  type TodayState,
} from "../../lib/supervisorDay";
import { useHolidays } from "../../lib/useHolidays";
import { finalEvaluationPath, type FinalDue } from "./finalDue";
import { internPath } from "./internPath";
import { useInternSchedules } from "./useInternSchedules";
import type { Intern, QueueItem, SupervisorWork } from "./useSupervisorWork";

/*
|--------------------------------------------------------------------------
| TODAY
|--------------------------------------------------------------------------
|
| The top of the Review page: one chip per intern saying where they are
| today, then the few things worth knowing before the queue is opened: how
| long the oldest item has waited, tasks due this week and who still owes
| them, who is close to finishing without a final evaluation, an
| announcement not yet read, and the coordinator's latest visit.
|
| Everything but the last two comes from lists the page already holds.
|
*/

/** How far ahead "due soon" looks. */
const DUE_WITHIN_DAYS = 7;

const CHIP: Record<TodayState, { label: string; className: string; dot: string }> = {
  on: { label: "On the clock", className: "border-emerald-600 bg-emerald-50 text-emerald-950", dot: "bg-emerald-600" },
  done: { label: "Done for today", className: "border-slate-300 bg-slate-200 text-slate-800", dot: "bg-slate-500" },
  missing: { label: "Not in yet", className: "border-amber-600 bg-amber-50 text-amber-950", dot: "bg-amber-600" },
  absent: { label: "Absence filed", className: "border-red-700 bg-white text-slate-900", dot: "bg-red-700" },
  expected: { label: "Expected", className: "border-slate-300 bg-white text-slate-900", dot: "bg-psu-600" },
  off: { label: "Not scheduled", className: "border-slate-300 bg-white text-slate-700", dot: "bg-slate-300" },
};

function clockTime(value: string | null | undefined): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value || "");
  if (!match) return "";
  const hour = Number(match[1]);
  return `${hour % 12 === 0 ? 12 : hour % 12}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
}

/** The minute of the day, kept current while the page is open. */
function useNowMinutes(): number {
  const [minutes, setMinutes] = useState(() => minuteOfDay(new Date()) ?? 0);
  useEffect(() => {
    const timer = window.setInterval(() => setMinutes(minuteOfDay(new Date()) ?? 0), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return minutes;
}

type Visit = { visit_date: string; follow_up: string | null; company: string };
type Unread = { announcement: { id: number; title: string } | null; unread: number };

function useAnswer<T>(path: string, saveAs: string): T | null {
  const [answer, setAnswer] = useState<T | null>(null);
  useEffect(() => {
    let current = true;
    savedFetch("supervisor", saveAs, `${API_URL}${path}`, withSupervisorAuth())
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (current && data) setAnswer(data as T);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [path, saveAs]);
  return answer;
}

function queueWord(item: QueueItem): string {
  if (item.kind === "attendance") return "an attendance log";
  if (item.kind === "task") return "a task submission";
  if (item.kind === "document") return "a document";
  if (item.kind === "absence") return "an absence";
  return "a weekly report";
}

export default function TodayStrip({
  interns,
  work,
  finalDue,
  onOpen,
}: {
  /** The interns to show: all of them, or the group the page is narrowed to. */
  interns: Intern[];
  work: SupervisorWork;
  finalDue: FinalDue[];
  /** Opens one item of the queue. */
  onOpen: (key: string) => void;
}) {
  const schedules = useInternSchedules();
  const holidays = useHolidays("supervisor");
  const nowMinutes = useNowMinutes();
  const today = phDateKey(new Date());
  const holiday = holidays.find((item) => String(item.date).slice(0, 10) === today);
  const visit = useAnswer<{ visit: Visit | null }>("/api/supervisor/site-visit", "site-visit")?.visit ?? null;
  const unread = useAnswer<Unread>("/api/supervisor/announcement-unread", "announcement-unread");

  const shown = useMemo(() => new Set(interns.map((intern) => intern.student_id)), [interns]);

  const chips = useMemo(() => {
    const logToday = new Map(
      work.attendance.filter((entry) => String(entry.date).slice(0, 10) === today).map((entry) => [entry.student_id, entry])
    );
    const absentToday = new Set(
      work.absences.filter((entry) => String(entry.date).slice(0, 10) === today).map((entry) => entry.student_id)
    );
    return interns.map((intern) => {
      const log = logToday.get(intern.student_id) ?? null;
      // Today's shift, in the week of a two-week pattern that today falls in.
      const shift = shiftOn(schedules?.get(intern.student_id) ?? [], today) ?? null;
      // Without the schedules, only what has happened can be said.
      const state: TodayState | null =
        schedules === null && !log && !absentToday.has(intern.student_id)
          ? null
          : todayState({
              shift,
              holiday: Boolean(holiday),
              log,
              absence: absentToday.has(intern.student_id),
              nowMinutes,
            });
      const start = shift ? clockTime(shift.start_time) : "";
      const detail =
        state === null
          ? ""
          : state === "expected" && start
            ? `Starts ${start}`
            : state === "missing" && start
              ? `Not in yet, started ${start}`
              : state === "off" && holiday
                ? "Holiday"
                : CHIP[state].label;
      return { intern, state, detail };
    });
  }, [interns, work.attendance, work.absences, schedules, holiday, nowMinutes, today]);

  const counts = useMemo(() => {
    const of = (state: TodayState) => chips.filter((chip) => chip.state === state).length;
    return { on: of("on"), done: of("done"), missing: of("missing") };
  }, [chips]);

  // The queue is oldest first already.
  const oldest = work.queue.find((item) => shown.has(item.entry.student_id));
  const oldestDays = oldest ? daysWaiting(oldest.waitingSince) : 0;

  // Tasks due within a week that someone has not submitted, a team task once.
  const dueSoon = useMemo(() => {
    const groups = new Map<string, { title: string; due: string; names: string[] }>();
    for (const task of work.tasks) {
      if (!shown.has(task.student_id) || task.scheduled) continue;
      if (task.status !== "Pending" && task.status !== "In Progress") continue;
      const days = daysUntil(task.due_date);
      if (days === null || days > DUE_WITHIN_DAYS || days < 0) continue;
      const key = task.group_task_id ? `team-${task.group_task_id}` : `task-${task.id}`;
      const group = groups.get(key) ?? { title: task.title, due: task.due_date || "", names: [] };
      group.names.push(task.student_name);
      groups.set(key, group);
    }
    return [...groups.entries()]
      .map(([key, group]) => ({ key, ...group }))
      .sort((a, b) => a.due.localeCompare(b.due))
      .slice(0, 5);
  }, [work.tasks, shown]);

  const finishing = finalDue.filter((item) => shown.has(item.entry.student_id));

  if (interns.length === 0) return null;

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-base font-semibold text-slate-900">Today</h2>
        <p className="text-sm text-slate-600">
          {formatLongDate(today)}
          {holiday ? ` · Holiday: ${holiday.name}` : ""}
          {` · ${counts.on} on the clock, ${counts.done} done`}
          {counts.missing > 0 ? `, ${counts.missing} not in yet` : ""}
        </p>
      </div>

      <ul className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap" aria-label="Your interns today">
        {chips.map(({ intern, state, detail }) => {
          const look = state ? CHIP[state] : CHIP.off;
          return (
            <li key={intern.student_id}>
              <Link
                to={internPath(intern.student_id, "attendance")}
                className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 py-1.5 text-left hover:border-psu-500 ${look.className}`}
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${look.dot}`} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-tight">{intern.name}</span>
                  <span className="block text-xs leading-tight">{detail || "Checking the schedule"}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100 text-sm">
        <Line icon="clock">
          {oldest ? (
            <>
              The oldest item waiting on you is {queueWord(oldest)} from {oldest.entry.student_name}:{" "}
              <span
                className={
                  oldestDays >= WAITING_TOO_LONG_DAYS
                    ? "rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-950"
                    : "font-semibold text-slate-900"
                }
              >
                {oldestDays === 0 ? "since today" : `${oldestDays} ${oldestDays === 1 ? "day" : "days"}`}
              </span>
              .{" "}
              <button
                type="button"
                onClick={() => onOpen(oldest.key)}
                className="font-semibold text-psu-700 hover:underline"
              >
                Review it
              </button>
            </>
          ) : (
            "Nothing is waiting on you."
          )}
        </Line>

        <Line icon="tasks">
          {dueSoon.length === 0 ? (
            `No task is due in the next ${DUE_WITHIN_DAYS} days that has not been submitted.`
          ) : (
            <>
              Due in the next {DUE_WITHIN_DAYS} days, not yet submitted:
              <ul className="mt-1 space-y-0.5">
                {dueSoon.map((task) => (
                  <li key={task.key} className="break-words">
                    <span className="font-medium text-slate-900">{task.title}</span>{" "}
                    <span className="text-slate-600">
                      ({dueLabel(task.due)}): {task.names.join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Line>

        {finishing.length > 0 && (
          <Line icon="star">
            Close to finishing with no final evaluation yet:{" "}
            {finishing.map((item, index) => (
              <span key={item.key}>
                {index > 0 && ", "}
                <Link
                  to={finalEvaluationPath(item.entry.student_id)}
                  className="font-semibold text-psu-700 hover:underline"
                >
                  {item.entry.student_name}
                </Link>{" "}
                <span className="text-slate-600">
                  ({formatHours(item.entry.hours_rendered)} of {formatHours(item.entry.required_hours)})
                </span>
              </span>
            ))}
          </Line>
        )}

        {unread?.announcement && (
          <Line icon="megaphone">
            Announcement not read yet:{" "}
            <Link to="/supervisor/announcements" className="font-semibold text-psu-700 hover:underline">
              {unread.announcement.title}
            </Link>
            {unread.unread > 1 && <span className="text-slate-600"> and {unread.unread - 1} more</span>}
          </Line>
        )}

        {visit && (
          <Line icon="building">
            The OJT coordinator last visited {visit.company} on{" "}
            <span className="font-medium text-slate-900">{formatLongDate(visit.visit_date)}</span>.
            {visit.follow_up ? (
              <span className="mt-0.5 block whitespace-pre-line break-words text-slate-700">
                <span className="font-medium">To follow up:</span> {visit.follow_up}
              </span>
            ) : (
              " Nothing was left to follow up."
            )}
          </Line>
        )}
      </ul>
    </Card>
  );
}

function Line({ icon, children }: { icon: React.ComponentProps<typeof Icon>["name"]; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 py-2.5 text-slate-700">
      <Icon name={icon} size={16} className="mt-0.5 shrink-0 text-slate-600" />
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}

/** Where the Today strip will be, while the interns load (Iteration 14, P2): the page does not jump when it arrives. */
export function TodayStripSkeleton() {
  return (
    <Card className="p-4 sm:p-5">
      <div aria-hidden="true">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-base font-semibold text-slate-900">Today</h2>
          <Skeleton className="h-4 w-56 max-w-full" />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          <Skeleton className="h-[47px] w-full rounded-lg sm:w-44" />
          <Skeleton className="h-[47px] w-full rounded-lg sm:w-44" />
        </div>
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      </div>
    </Card>
  );
}
