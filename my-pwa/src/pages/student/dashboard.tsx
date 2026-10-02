import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../../components/Icon";
import Tooltip from "../../components/Tooltip";
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  ProgressRing,
  Skeleton,
  SkeletonRows,
  StatusBadge,
} from "../../components/ui";
import StudentLayout from "../../layouts/StudentLayout";
import { API_URL, withStudentAuth } from "../../lib/api";
import {
  daysUntil,
  dueLabel,
  formatDate,
  formatDayDate,
  formatHours,
  formatTime,
  greetingFor,
  localDateKey,
} from "../../lib/format";
import { useAccount } from "../../lib/session";
import { MissedTimeOutNotice } from "./AttendanceCorrections";
import TodayAttendance from "./TodayAttendance";
import { logDateKey, useAttendance, type AttendanceLog } from "./useAttendance";

type DashboardData = {
  hoursRendered: number;
  requiredHours: number;
  daysLogged: number;
  activeTasks: number;
  completion: number;
  totalTasks: number;
  completedTasks: number;
  /** When verified hours first reached the requirement, if they have. */
  completedAt?: string | null;
};

type Task = {
  id: number;
  title: string;
  status: string;
  priority: string | null;
  due_date: string | null;
  assigned_by: string | null;
};

type ScheduleDay = { day: string; hours: number | string | null };

const OPEN_TASK_STATUSES = ["Pending", "In Progress"];

export default function Dashboard() {
  const student = useAccount("student");
  const studentId = student?.student_id;
  const attendance = useAttendance(studentId);

  const [summary, setSummary] = useState<DashboardData | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [weeklyScheduleHours, setWeeklyScheduleHours] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!studentId) return;
    const id = encodeURIComponent(studentId);
    try {
      const [summaryResponse, tasksResponse, scheduleResponse] = await Promise.all([
        fetch(`${API_URL}/api/dashboard/${id}`, withStudentAuth()),
        fetch(`${API_URL}/api/tasks/student/${id}`, withStudentAuth()),
        fetch(`${API_URL}/api/ojt-schedule/${id}`, withStudentAuth()),
      ]);
      if (!summaryResponse.ok) throw new Error("Could not load your progress.");
      setSummary((await summaryResponse.json()) as DashboardData);

      // Tasks and schedule only enrich the page; the summary can stand alone.
      if (tasksResponse.ok) {
        const list = await tasksResponse.json();
        setTasks(Array.isArray(list) ? (list as Task[]) : []);
      }
      if (scheduleResponse.ok) {
        const data = (await scheduleResponse.json()) as { schedule?: ScheduleDay[] };
        setWeeklyScheduleHours(
          (data.schedule || []).reduce((sum, day) => sum + (Number(day.hours) || 0), 0)
        );
      }
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof TypeError
          ? "Can't reach the server. Check your connection and try again."
          : loadError instanceof Error
            ? loadError.message
            : "Could not load your progress."
      );
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    const refresh = () => {
      void load();
    };
    refresh();
    window.addEventListener("internet-notification", refresh);
    return () => window.removeEventListener("internet-notification", refresh);
  }, [load]);

  const openTasks = useMemo(
    () =>
      tasks
        .filter((task) => OPEN_TASK_STATUSES.includes(task.status))
        .sort((a, b) => {
          const left = a.due_date ? new Date(a.due_date).getTime() : Infinity;
          const right = b.due_date ? new Date(b.due_date).getTime() : Infinity;
          return left - right;
        }),
    [tasks]
  );

  const needsAttention = attendance.logs.filter(
    (log) => log.status === "Rejected" || log.status === "Flagged"
  ).length;
  const overdueTasks = openTasks.filter((task) => (daysUntil(task.due_date) ?? 0) < 0).length;

  const firstName = (student?.name || "").trim().split(/\s+/)[0] || "there";

  return (
    <StudentLayout title="Today" subtitle={`${greetingFor(new Date())}, ${firstName}.`}>
      <div className="space-y-5">
        {(attendance.error || error) && (
          <ErrorNotice
            message={attendance.error || error}
            onRetry={() => {
              void attendance.reload();
              void load();
            }}
          />
        )}

        <MissedTimeOutNotice attendance={attendance} />

        <TodayAttendance attendance={attendance} />

        {summary?.completedAt && (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5">
            <Icon name="check-circle" className="mt-0.5 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-emerald-950">
                You completed your required hours on {formatDate(summary.completedAt)}
              </p>
              <p className="text-sm text-emerald-900">
                Check that your documents and tasks are complete too, then print your time
                record for signing.
              </p>
            </div>
            <Link
              to="/time-record"
              className="shrink-0 text-sm font-semibold text-emerald-900 underline-offset-2 hover:underline"
            >
              Time record
            </Link>
          </div>
        )}

        {(needsAttention > 0 || overdueTasks > 0) && (
          <div
            className={`grid gap-3 ${
              needsAttention > 0 && overdueTasks > 0 ? "sm:grid-cols-2" : ""
            }`}
          >
            {needsAttention > 0 && (
              <AttentionLink
                to="/daily-log"
                title={`${needsAttention} attendance ${needsAttention === 1 ? "log was" : "logs were"} rejected`}
                detail="Read your supervisor's note, then ask for another review."
              />
            )}
            {overdueTasks > 0 && (
              <AttentionLink
                to="/task"
                title={`${overdueTasks} ${overdueTasks === 1 ? "task is" : "tasks are"} past due`}
                detail="Submit your work as soon as you can."
              />
            )}
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <ProgressCard
              summary={summary}
              loading={loading}
              weeklyScheduleHours={weeklyScheduleHours}
            />
            <WeekCard logs={attendance.logs} loading={attendance.loading} />
          </div>

          <div className="space-y-5">
            <Card>
              <CardHeader
                title="Up next"
                description={
                  openTasks.length > 0
                    ? `${openTasks.length} open ${openTasks.length === 1 ? "task" : "tasks"}`
                    : undefined
                }
                action={<SeeAll to="/task" />}
              />
              {loading ? (
                <SkeletonRows rows={3} />
              ) : openTasks.length === 0 ? (
                <EmptyState
                  icon="tasks"
                  title="No open tasks"
                  description="Tasks your supervisor assigns will appear here."
                />
              ) : (
                <ul className="mt-2 divide-y divide-slate-100">
                  {openTasks.slice(0, 4).map((task) => {
                    const days = daysUntil(task.due_date);
                    const late = days !== null && days < 0;
                    const soon = days !== null && days >= 0 && days <= 2;
                    return (
                      <li key={task.id}>
                        <Link
                          to="/task"
                          className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5"
                        >
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-psu-50 text-psu-700">
                            <Icon name="tasks" size={16} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-900">
                              {task.title}
                            </span>
                            <span
                              className={`mt-0.5 block text-xs ${
                                late
                                  ? "font-semibold text-red-600"
                                  : soon
                                    ? "font-semibold text-amber-700"
                                    : "text-slate-500"
                              }`}
                            >
                              {dueLabel(task.due_date)}
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader title="Recent attendance" action={<SeeAll to="/daily-log" />} />
              {attendance.loading ? (
                <SkeletonRows rows={3} />
              ) : attendance.logs.length === 0 ? (
                <EmptyState
                  icon="clock"
                  title="No attendance yet"
                  description="Your daily logs will appear here once you time in."
                />
              ) : (
                <ul className="mt-2 divide-y divide-slate-100">
                  {attendance.logs.slice(0, 4).map((log) => (
                    <li
                      key={log.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">
                          {formatDayDate(logDateKey(log))}
                        </p>
                        <p className="tabular mt-0.5 text-xs text-slate-500">
                          {formatTime(log.time_in)} – {formatTime(log.time_out)}
                          {log.hours !== null && ` · ${formatHours(log.hours)}`}
                        </p>
                      </div>
                      <StatusBadge status={log.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>
    </StudentLayout>
  );
}

function SeeAll({ to }: { to: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-sm font-semibold text-psu-700 hover:underline"
    >
      See all
      <Icon name="chevron-right" size={14} />
    </Link>
  );
}

function AttentionLink({
  to,
  title,
  detail,
}: {
  to: string;
  title: string;
  detail: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 hover:bg-red-100/70"
    >
      <Icon name="alert" className="mt-0.5 shrink-0 text-red-600" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-red-900">{title}</span>
        <span className="block text-sm text-red-800">{detail}</span>
      </span>
      <Icon name="chevron-right" size={16} className="mt-1 shrink-0 text-red-400" />
    </Link>
  );
}

/*
|--------------------------------------------------------------------------
| OJT PROGRESS
|--------------------------------------------------------------------------
*/

function ProgressCard({
  summary,
  loading,
  weeklyScheduleHours,
}: {
  summary: DashboardData | null;
  loading: boolean;
  weeklyScheduleHours: number;
}) {
  if (loading || !summary) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-6">
          <Skeleton className="h-32 w-32 rounded-full" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      </Card>
    );
  }

  const rendered = Number(summary.hoursRendered) || 0;
  const required = Number(summary.requiredHours) || 0;
  const remaining = Math.max(0, required - rendered);
  const percent = required > 0 ? Math.min(100, (rendered / required) * 100) : 0;

  let outlook = "Your hours count once your supervisor verifies each log.";
  if (required > 0 && remaining === 0) {
    outlook = "You have completed your required hours.";
  } else if (weeklyScheduleHours > 0 && remaining > 0) {
    const weeks = Math.ceil(remaining / weeklyScheduleHours);
    outlook = `At your schedule of ${Number(weeklyScheduleHours.toFixed(1))} hours a week, about ${weeks} ${
      weeks === 1 ? "week" : "weeks"
    } to go.`;
  }

  return (
    <Card>
      <CardHeader title="OJT progress" description="Verified hours toward your requirement" />
      <div className="flex flex-col items-center gap-5 px-4 pb-5 pt-4 sm:flex-row sm:gap-7 sm:px-5">
        <ProgressRing
          value={percent}
          label={`${Math.round(percent)} percent of required hours completed`}
        >
          <span className="text-3xl font-bold tracking-tight text-slate-900">
            {Math.round(percent)}%
          </span>
          <span className="text-xs text-slate-500">complete</span>
        </ProgressRing>

        <div className="w-full min-w-0 flex-1">
          <dl className="grid grid-cols-3 gap-3 text-center sm:text-left">
            <Figure label="Rendered" value={formatHours(rendered)} />
            <Figure label="Remaining" value={formatHours(remaining)} />
            <Figure label="Days verified" value={String(summary.daysLogged)} />
          </dl>
          <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">
            {outlook}
          </p>
          {summary.totalTasks > 0 && (
            <p className="mt-1 text-sm text-slate-600">
              {summary.completedTasks} of {summary.totalTasks} tasks reviewed.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| LAST 7 DAYS
|--------------------------------------------------------------------------
|
| Hours per day for the past week, taken from the student's own logs. One
| series, so one colour and no legend; the value sits on each column.
|
*/

function WeekCard({ logs, loading }: { logs: AttendanceLog[]; loading: boolean }) {
  const days = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const log of logs) {
      const hours = Number(log.hours);
      if (Number.isFinite(hours) && hours > 0) {
        const key = logDateKey(log);
        byDate.set(key, (byDate.get(key) || 0) + hours);
      }
    }
    const today = new Date();
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (6 - index));
      const key = localDateKey(date);
      return {
        key,
        hours: byDate.get(key) || 0,
        weekday: date.toLocaleDateString("en-PH", { weekday: "short" }),
        isToday: index === 6,
      };
    });
  }, [logs]);

  const total = days.reduce((sum, day) => sum + day.hours, 0);
  // The scale tops out at a full working day, or higher if a day ran long.
  const scaleMax = Math.max(8, ...days.map((day) => day.hours));

  return (
    <Card>
      <CardHeader
        title="Last 7 days"
        description="Hours logged each day"
        action={
          <p className="text-sm text-slate-500">
            <span className="font-semibold text-slate-900">{formatHours(total)}</span> total
          </p>
        }
      />
      <div className="px-4 pb-4 pt-5 sm:px-5">
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="flex items-end gap-1 border-b border-slate-200 sm:gap-3">
            {days.map((day) => (
              <Tooltip
                key={day.key}
                label={`${formatDayDate(day.key)}: ${day.hours > 0 ? formatHours(day.hours) : "no hours logged"}`}
                className="h-40 flex-1 flex-col items-center justify-end"
              >
                <span
                  className={`tabular mb-1 text-xs ${
                    day.hours > 0 ? "font-medium text-slate-700" : "text-slate-300"
                  }`}
                >
                  {day.hours > 0 ? Number(day.hours.toFixed(1)) : "–"}
                </span>
                <div
                  className="w-full max-w-6 rounded-t bg-psu-600 transition-[height,background-color] duration-500 group-hover/tip:bg-psu-800"
                  style={{ height: `${Math.round((day.hours / scaleMax) * 120)}px` }}
                />
              </Tooltip>
            ))}
          </div>
        )}
        {!loading && (
          <div className="mt-2 flex gap-1 sm:gap-3">
            {days.map((day) => (
              <span
                key={day.key}
                className={`flex-1 text-center text-xs ${
                  day.isToday ? "font-semibold text-psu-700" : "text-slate-500"
                }`}
              >
                {day.isToday ? "Today" : day.weekday}
              </span>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
