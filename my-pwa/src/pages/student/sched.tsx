import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Icon from "../../components/Icon";
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  FilterChips,
  Skeleton,
  SkeletonRows,
} from "../../components/ui";
import StudentLayout from "../../layouts/StudentLayout";
import { API_URL, withStudentAuth } from "../../lib/api";
import {
  daysUntil,
  dueLabel,
  formatDate,
  formatHours,
  formatLongDate,
  phDateKey,
} from "../../lib/format";
import { savedFetch } from "../../lib/offlineStore";
import { useAccount } from "../../lib/session";
import { downloadCalendar, scheduleCalendar } from "../../lib/ics";
import { errorText, toast } from "../../lib/toast";
import { useProjections } from "../../lib/useProjections";
import { useHolidays } from "../../lib/useHolidays";
import ScheduleMonth from "./ScheduleMonth";
import { deliverablesForCalendar, useDeliverables } from "./useDeliverables";
import ScheduleProgress from "./ScheduleProgress";
import { formatPh } from "../../lib/phTime";
import { patternWeek } from "../../lib/schedulePattern";
import { weeklyShiftHours, type ShiftPattern } from "../../lib/studentCalendar";

/** The page's three views. The one shown is in the address, so Back returns to it. */
type View = "week" | "month" | "progress";
const VIEWS: readonly { value: View; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "progress", label: "My progress" },
];

type Absence = { date: string; status: string; reason?: string | null };

type ScheduleDay = {
  id: number;
  /** Which week of a two-week pattern (Iteration 11); 1 when missing. */
  week?: number | null;
  day: string;
  start_time: string | null;
  end_time: string | null;
  focus: string | null;
  hours: number | string | null;
};

type Company = {
  name: string;
  supervisor: string;
  department: string;
  address: string;
};

type Task = {
  id: number;
  title: string;
  status: string;
  due_date: string | null;
};

const WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** This week's date for each weekday, Monday first, as "YYYY-MM-DD". */
function thisWeekDates(now: Date, weeksAhead = 0): Map<string, string> {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + weeksAhead * 7);
  return new Map(
    WEEK.map((day, offset) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + offset);
      return [day, phDateKey(date)];
    })
  );
}

/** "08:00:00" from the database becomes "8:00 AM". */
function formatClockTime(time: string | null): string {
  if (!time) return "";
  const [hourText, minute = "00"] = time.split(":");
  const hour = Number(hourText);
  if (Number.isNaN(hour)) return time;
  return `${hour % 12 === 0 ? 12 : hour % 12}:${minute} ${hour >= 12 ? "PM" : "AM"}`;
}

export default function OjtSchedule() {
  const student = useAccount("student");
  const studentId = student?.student_id;

  const [schedule, setSchedule] = useState<ScheduleDay[]>([]);
  // How the schedule repeats: every week, or two weeks taking turns (Iteration 11).
  const [pattern, setPattern] = useState<ShiftPattern>({ weeks: 1, anchor: null });
  const [company, setCompany] = useState<Company | null>(null);
  const [coordinator, setCoordinator] = useState<{ name: string; email: string } | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  // The start of the student's term: the weeks of the OJT are counted from
  // it when there is no log yet.
  const [termStart, setTermStart] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const asked = params.get("view");
  const view: View = asked === "month" || asked === "progress" ? asked : "week";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const holidays = useHolidays("student");
  // What is due of the student besides tasks: a dot on the calendar for each.
  const due = useDeliverables(studentId);
  const dueOnCalendar = useMemo(
    () => [...tasks, ...deliverablesForCalendar(due.deliverables, due.weekly)],
    [tasks, due.deliverables, due.weekly]
  );

  const load = useCallback(async () => {
    if (!studentId) return;
    const id = encodeURIComponent(studentId);
    try {
      const [scheduleResponse, companyResponse, tasksResponse] = await Promise.all([
        savedFetch("student", "schedule", `${API_URL}/api/ojt-schedule/${id}`, withStudentAuth()),
        savedFetch("student", "company", `${API_URL}/api/company/${id}`, withStudentAuth()),
        savedFetch("student", "tasks", `${API_URL}/api/tasks/student/${id}`, withStudentAuth()),
      ]);
      if (!scheduleResponse.ok) throw new Error("Could not load your schedule.");
      const scheduleData = await scheduleResponse.json();
      setSchedule(Array.isArray(scheduleData.schedule) ? scheduleData.schedule : []);
      setPattern(scheduleData.pattern?.weeks === 2 ? { weeks: 2, anchor: scheduleData.pattern.anchor } : { weeks: 1, anchor: null });

      if (companyResponse.ok) {
        const companyData = await companyResponse.json();
        setCompany(companyData.company ?? null);
      }
      if (tasksResponse.ok) {
        const list = await tasksResponse.json();
        setTasks(Array.isArray(list) ? list : []);
      }
      setError("");
      // Who to ask at the university. Extra to the page: a failure here is not shown.
      savedFetch("student", "profile", `${API_URL}/api/students/${id}/profile`, withStudentAuth())
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          setCoordinator(data?.coordinator ?? null);
          setTermStart(data?.term?.start_date ?? null);
        })
        .catch(() => undefined);
      // The absences filed, for the month view. Kept for offline like the rest.
      savedFetch("student", "absences", `${API_URL}/api/absences/student/${id}`, withStudentAuth())
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => setAbsences(Array.isArray(data?.absences) ? data.absences : []))
        .catch(() => undefined);
    } catch (loadError) {
      setError(errorText(loadError, "Could not load your schedule."));
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  // The schedule names its days in English ("Monday").
  const today = formatPh(new Date(), { weekday: "long" }, "en-US");
  const todayKey = phDateKey(new Date());
  // With two weeks taking turns, this week is one of them and next week the other.
  const thisWeek = patternWeek(pattern.anchor, pattern.weeks, todayKey);
  const daysOf = useCallback(
    (week: number) => new Map(schedule.filter((item) => (Number(item.week) || 1) === week).map((item) => [item.day, item])),
    [schedule]
  );
  const byDay = useMemo(() => daysOf(thisWeek), [daysOf, thisWeek]);
  const weeklyHours = weeklyShiftHours(schedule, pattern);
  const todayShift = byDay.get(today);
  const workingDays = byDay.size;

  // The weekly list is any week; holidays are dates. So each weekday is
  // matched to its date this week, and a holiday on it is named there.
  const holidayOn = useMemo(
    () => new Map(holidays.map((holiday) => [holiday.date, holiday.name])),
    [holidays]
  );
  const weekDates = useMemo(() => thisWeekDates(new Date(`${todayKey}T00:00:00`)), [todayKey]);
  const nextWeekDates = useMemo(() => thisWeekDates(new Date(`${todayKey}T00:00:00`), 1), [todayKey]);
  // The weeks the list shows: this one, and for a two-week pattern the next as well.
  const weeksShown = pattern.weeks === 2
    ? [
        { label: `This week, week ${thisWeek} of 2`, days: byDay, dates: weekDates, current: true },
        { label: `Next week, week ${thisWeek === 1 ? 2 : 1} of 2`, days: daysOf(thisWeek === 1 ? 2 : 1), dates: nextWeekDates, current: false },
      ]
    : [{ label: "", days: byDay, dates: weekDates, current: true }];
  const todayHoliday = holidayOn.get(todayKey);
  const upcomingHolidays = holidays.filter((holiday) => holiday.date >= todayKey).slice(0, 5);

  // The schedule as a file for the phone's own calendar: repeating up to
  // the projected finish (or half a year when that is not known), with
  // the holidays left out. It is a copy; a changed schedule is exported again.
  const projection = [...useProjections("student").values()][0];
  const addToCalendar = () => {
    const halfYear = new Date(`${todayKey}T00:00:00`);
    halfYear.setDate(halfYear.getDate() + 182);
    downloadCalendar(
      "internet-ojt-schedule.ics",
      scheduleCalendar({
        shifts: schedule,
        pattern,
        holidays,
        company: company?.name || student?.company || "",
        today: todayKey,
        until: projection?.projected_finish || phDateKey(halfYear),
        stamp: `${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
      })
    );
    toast.success("Schedule saved as a calendar file. Open it to add it to your calendar.");
  };

  const deadlines = useMemo(
    () =>
      tasks
        .filter(
          (task) =>
            (task.status === "Pending" || task.status === "In Progress") && task.due_date
        )
        .sort(
          (a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime()
        )
        .slice(0, 6),
    [tasks]
  );

  return (
    <StudentLayout title="Schedule" subtitle="Your OJT days, what happened on each, and how you are getting on.">
      <div className="space-y-5">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        <FilterChips
          label="View"
          value={view}
          onChange={(next) => setParams(next === "week" ? {} : { view: next }, { replace: true })}
          options={VIEWS}
        />

        {view === "month" && (
          <ScheduleMonth
            shifts={schedule}
            pattern={pattern}
            holidays={holidays}
            absences={absences}
            tasks={dueOnCalendar}
            termStart={termStart}
          />
        )}
        {view === "progress" && (
          <ScheduleProgress shifts={schedule} pattern={pattern} holidays={holidays} termStart={termStart} />
        )}

        {view === "week" && (
        <>
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Weekly schedule"
              action={
                !loading && schedule.length > 0 ? (
                  <button
                    type="button"
                    onClick={addToCalendar}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-psu-700 hover:underline"
                  >
                    <Icon name="calendar" size={15} />
                    Add to calendar
                  </button>
                ) : undefined
              }
              description={
                loading
                  ? undefined
                  : schedule.length > 0
                    ? pattern.weeks === 2
                      ? `Repeats every two weeks · ${formatHours(weeklyHours)} a week on average`
                      : `${workingDays} working ${workingDays === 1 ? "day" : "days"} · ${formatHours(weeklyHours)} a week`
                    : undefined
              }
            />
            <div className="mt-3">
              {loading ? (
                <SkeletonRows rows={5} />
              ) : schedule.length === 0 ? (
                <EmptyState
                  icon="calendar"
                  title="No schedule yet"
                  description="Your OJT coordinator will assign your working days and hours."
                />
              ) : (
                <div>
                  {weeksShown.map((shown) => (
                    <section key={shown.label || "week"} aria-label={shown.label || undefined}>
                      {shown.label && (
                        <h3 className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-600 sm:px-5">
                          {shown.label}
                        </h3>
                      )}
                  <ul className="divide-y divide-slate-100 border-t border-slate-100">
                    {WEEK.map((day) => {
                      const shift = shown.days.get(day);
                      const isToday = shown.current && day === today;
                      const holiday = holidayOn.get(shown.dates.get(day) || "");
                      return (
                        <li
                          key={day}
                          className={`flex items-center gap-4 px-4 py-3.5 sm:px-5 ${
                            isToday ? "bg-psu-50" : ""
                          }`}
                        >
                          <div className="w-24 shrink-0">
                            <p
                              className={`text-sm font-semibold ${
                                shift || holiday ? "text-slate-900" : "text-slate-600"
                              }`}
                            >
                              {day}
                            </p>
                            {isToday && (
                              <p className="text-xs font-semibold text-psu-700">Today</p>
                            )}
                          </div>
                          {holiday ? (
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-slate-800">
                                Holiday {shown.current ? "this week" : "next week"}: {holiday}
                              </p>
                              {shift && (
                                <p className="tabular text-sm text-slate-500">
                                  Usually {formatClockTime(shift.start_time)} –{" "}
                                  {formatClockTime(shift.end_time)}
                                </p>
                              )}
                            </div>
                          ) : shift ? (
                            <>
                              <div className="min-w-0 flex-1">
                                <p className="tabular text-sm text-slate-800">
                                  {formatClockTime(shift.start_time)} –{" "}
                                  {formatClockTime(shift.end_time)}
                                </p>
                                {shift.focus && (
                                  <p className="truncate text-sm text-slate-600">
                                    {shift.focus}
                                  </p>
                                )}
                              </div>
                              <p className="tabular shrink-0 text-sm font-medium text-slate-700">
                                {formatHours(shift.hours)}
                              </p>
                            </>
                          ) : (
                            <p className="flex-1 text-sm text-slate-600">Day off</p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <div className="space-y-5">
            <Card className="p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-slate-900">Today</h2>
              {loading ? (
                <Skeleton className="mt-3 h-12 w-full" />
              ) : todayHoliday ? (
                <>
                  <p className="mt-2 text-xl font-bold tracking-tight text-slate-900">
                    {todayHoliday}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    Today is a holiday, so you are not expected to report. If your company has
                    you work, time in as usual and the hours count.
                  </p>
                </>
              ) : todayShift ? (
                <>
                  <p className="tabular mt-2 text-xl font-bold tracking-tight text-slate-900">
                    {formatClockTime(todayShift.start_time)} –{" "}
                    {formatClockTime(todayShift.end_time)}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {todayShift.focus || "Scheduled OJT day"}
                  </p>
                  <Link
                    to="/daily-log"
                    className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-psu-700 hover:underline"
                  >
                    Go to attendance
                    <Icon name="chevron-right" size={14} />
                  </Link>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-600">
                  You are not scheduled to work today.
                </p>
              )}
            </Card>

            {upcomingHolidays.length > 0 && (
              <Card className="p-4 sm:p-5">
                <h2 className="text-sm font-semibold text-slate-900">Upcoming holidays</h2>
                <ul className="mt-3 space-y-2.5 text-sm">
                  {upcomingHolidays.map((holiday) => (
                    <li key={holiday.id}>
                      <p className="font-medium text-slate-900">{holiday.name}</p>
                      <p className="tabular text-slate-600">
                        {holiday.date === todayKey ? "Today" : formatLongDate(holiday.date)}
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card className="p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-slate-900">Host company</h2>
              {loading ? (
                <div className="mt-3 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ) : (
                <div className="mt-3 space-y-3 text-sm">
                  <Detail icon="building" label="Company">
                    {company?.name || student?.company || "Not assigned yet"}
                  </Detail>
                  <Detail icon="user" label="Supervisor">
                    {company?.supervisor || "Not assigned yet"}
                  </Detail>
                  {company?.department && (
                    <Detail icon="users" label="Department">
                      {company.department}
                    </Detail>
                  )}
                  {coordinator && (
                    <Detail icon="user" label="OJT coordinator">
                      {coordinator.name}
                      <a
                        href={`mailto:${coordinator.email}`}
                        className="block break-all text-psu-700 hover:underline"
                      >
                        {coordinator.email}
                      </a>
                    </Detail>
                  )}
                </div>
              )}
            </Card>
          </div>
        </div>

        <Card>
          <CardHeader
            title="Upcoming deadlines"
            description="Open tasks by due date"
            action={
              <Link
                to="/task"
                className="inline-flex items-center gap-1 text-sm font-semibold text-psu-700 hover:underline"
              >
                All tasks
                <Icon name="chevron-right" size={14} />
              </Link>
            }
          />
          <div className="mt-3">
            {loading ? (
              <SkeletonRows rows={3} />
            ) : deadlines.length === 0 ? (
              <EmptyState icon="check-circle" title="No upcoming deadlines" />
            ) : (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {deadlines.map((task) => {
                  const days = daysUntil(task.due_date) ?? 0;
                  return (
                    <li
                      key={task.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {task.title}
                        </p>
                        <p className="text-xs text-slate-500">{formatDate(task.due_date)}</p>
                      </div>
                      <p
                        className={`shrink-0 text-sm font-semibold ${
                          days < 0
                            ? "text-red-600"
                            : days <= 2
                              ? "text-amber-700"
                              : "text-slate-600"
                        }`}
                      >
                        {dueLabel(task.due_date)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>
        </>
        )}
      </div>
    </StudentLayout>
  );
}

function Detail({
  icon,
  label,
  children,
}: {
  icon: "building" | "user" | "users";
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon name={icon} size={17} className="mt-0.5 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <div className="font-medium text-slate-900">{children}</div>
      </div>
    </div>
  );
}
