import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../../components/Icon";
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  Skeleton,
  SkeletonRows,
} from "../../components/ui";
import StudentLayout from "../../layouts/StudentLayout";
import { API_URL, withStudentAuth } from "../../lib/api";
import { daysUntil, dueLabel, formatDate, formatHours } from "../../lib/format";
import { savedFetch } from "../../lib/offlineStore";
import { useAccount } from "../../lib/session";
import { errorText } from "../../lib/toast";

type ScheduleDay = {
  id: number;
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
  const [company, setCompany] = useState<Company | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

      if (companyResponse.ok) {
        const companyData = await companyResponse.json();
        setCompany(companyData.company ?? null);
      }
      if (tasksResponse.ok) {
        const list = await tasksResponse.json();
        setTasks(Array.isArray(list) ? list : []);
      }
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load your schedule."));
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const byDay = useMemo(() => new Map(schedule.map((item) => [item.day, item])), [schedule]);
  const weeklyHours = schedule.reduce((sum, item) => sum + (Number(item.hours) || 0), 0);
  const todayShift = byDay.get(today);

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
    <StudentLayout title="Schedule" subtitle="Your weekly OJT hours and where you report.">
      <div className="space-y-5">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Weekly schedule"
              description={
                loading
                  ? undefined
                  : schedule.length > 0
                    ? `${schedule.length} working ${schedule.length === 1 ? "day" : "days"} · ${formatHours(weeklyHours)} a week`
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
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {WEEK.map((day) => {
                    const shift = byDay.get(day);
                    const isToday = day === today;
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
                              shift ? "text-slate-900" : "text-slate-400"
                            }`}
                          >
                            {day}
                          </p>
                          {isToday && (
                            <p className="text-xs font-semibold text-psu-700">Today</p>
                          )}
                        </div>
                        {shift ? (
                          <>
                            <div className="min-w-0 flex-1">
                              <p className="tabular text-sm text-slate-800">
                                {formatClockTime(shift.start_time)} –{" "}
                                {formatClockTime(shift.end_time)}
                              </p>
                              {shift.focus && (
                                <p className="truncate text-sm text-slate-500">
                                  {shift.focus}
                                </p>
                              )}
                            </div>
                            <p className="tabular shrink-0 text-sm font-medium text-slate-700">
                              {formatHours(shift.hours)}
                            </p>
                          </>
                        ) : (
                          <p className="flex-1 text-sm text-slate-400">Day off</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>

          <div className="space-y-5">
            <Card className="p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-slate-900">Today</h2>
              {loading ? (
                <Skeleton className="mt-3 h-12 w-full" />
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

            <Card className="p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-slate-900">Host company</h2>
              {loading ? (
                <div className="mt-3 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ) : (
                <dl className="mt-3 space-y-3 text-sm">
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
                </dl>
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
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="font-medium text-slate-900">{children}</dd>
      </div>
    </div>
  );
}
