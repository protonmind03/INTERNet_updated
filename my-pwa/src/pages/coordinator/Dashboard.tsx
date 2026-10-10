import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ColumnChart, ShareBar } from "../../components/charts";
import Icon, { type IconName } from "../../components/Icon";
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  ProgressBar,
  Skeleton,
  SkeletonRows,
  StatTile,
} from "../../components/ui";
import { BrandLoader } from "../../brand";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import { formatDate, formatHours, formatLongDate, greetingFor } from "../../lib/format";
import { useLaunchReady } from "../../lib/launch";
import { errorText } from "../../lib/toast";
import { coordinatorRequest } from "./request";

type DashboardData = {
  students: { active: number; total: number };
  supervisors: { active: number; total: number };
  pendingAttendance: number;
  flaggedAttendance: number;
  pendingComplaints: number;
  tasks: { awaitingReview: number; completed: number; total: number };
  totalHoursLogged: number;
  today: { timedIn: number; onTheClock: number; absent: number };
  weekHours: number;
  hoursTrend: { day: string; hours: number; logs: number }[];
};

type MonitorRow = {
  student_id: string;
  name: string;
  company: string | null;
  supervisor_name: string | null;
  required_hours: number;
  hours_rendered: number;
  pending_logs: number;
  tasks_awaiting_review: number;
  flagged_logs: number;
  overdue_tasks: number;
  completion: number;
};

type AttentionItem = {
  key: string;
  count: number;
  title: string;
  detail: string;
  to: string;
  icon: IconName;
  urgent: boolean;
};

// Lighter to darker along the same blue: further along is darker.
const PROGRESS_BANDS = [
  { label: "Not started", color: "#95a9fc", holds: (percent: number) => percent <= 0 },
  { label: "Under halfway", color: "#637bf4", holds: (percent: number) => percent > 0 && percent < 50 },
  { label: "Past halfway", color: "#1d36d3", holds: (percent: number) => percent >= 50 && percent < 100 },
  { label: "Completed", color: "#0f1e6e", holds: (percent: number) => percent >= 100 },
];

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** "Oct 6" for a "YYYY-MM-DD" day. */
const dayLabel = (day: string) => formatDate(day).replace(/, \d{4}$/, "");

export default function CoordinatorDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [rows, setRows] = useState<MonitorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useLaunchReady(!loading);

  const load = useCallback(async () => {
    try {
      const [summary, monitoring] = await Promise.all([
        coordinatorRequest<DashboardData>("/api/coordinator/dashboard"),
        coordinatorRequest<{ students: MonitorRow[] }>("/api/coordinator/monitoring"),
      ]);
      setData(summary);
      setRows(monitoring.students || []);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load the dashboard."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const refresh = () => {
      void load();
    };
    refresh();
    // Several notifications often arrive together; reload once for the burst.
    let timer = 0;
    const later = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 400);
    };
    window.addEventListener("internet-notification", later);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("internet-notification", later);
    };
  }, [load]);

  // Students with a flagged log or an overdue task, worst first.
  const watchList = useMemo(
    () =>
      rows
        .filter((row) => row.flagged_logs > 0 || row.overdue_tasks > 0)
        .sort(
          (a, b) =>
            b.flagged_logs + b.overdue_tasks - (a.flagged_logs + a.overdue_tasks)
        )
        .slice(0, 6),
    [rows]
  );

  // How much each supervisor has waiting on them, most first.
  const supervisorQueues = useMemo(() => {
    const queues = new Map<string, { logs: number; tasks: number; interns: number }>();
    for (const row of rows) {
      if (!row.supervisor_name) continue;
      const queue = queues.get(row.supervisor_name) ?? { logs: 0, tasks: 0, interns: 0 };
      queue.logs += row.pending_logs || 0;
      queue.tasks += row.tasks_awaiting_review || 0;
      queue.interns += 1;
      queues.set(row.supervisor_name, queue);
    }
    return [...queues.entries()]
      .map(([name, queue]) => ({ name, ...queue, waiting: queue.logs + queue.tasks }))
      .sort((a, b) => b.waiting - a.waiting || a.name.localeCompare(b.name));
  }, [rows]);

  const unassigned = rows.filter((row) => !row.supervisor_name).length;
  const completed = rows.filter((row) => row.completion >= 100).length;
  const averageCompletion =
    rows.length > 0
      ? Math.round(rows.reduce((sum, row) => sum + row.completion, 0) / rows.length)
      : 0;

  const candidates: AttentionItem[] = data
    ? [
        {
          key: "complaints",
          count: data.pendingComplaints,
          title: data.pendingComplaints === 1 ? "complaint to review" : "complaints to review",
          detail: "Filed by students or supervisors and not yet looked at.",
          to: "/coordinator/complaints",
          icon: "flag",
          urgent: true,
        },
        {
          key: "flagged",
          count: data.flaggedAttendance,
          title:
            data.flaggedAttendance === 1 ? "flagged attendance log" : "flagged attendance logs",
          detail: "Rejected, missing a time-out, or left unverified for days.",
          to: "/coordinator/monitoring?scope=attention",
          icon: "alert",
          urgent: true,
        },
        {
          key: "unassigned",
          count: unassigned,
          title: unassigned === 1 ? "student without a supervisor" : "students without a supervisor",
          detail: "They cannot upload documents or have logs verified until assigned.",
          to: "/coordinator/students?filter=unassigned",
          icon: "users",
          urgent: true,
        },
        {
          key: "pending",
          count: data.pendingAttendance,
          title:
            data.pendingAttendance === 1
              ? "attendance log awaiting a supervisor"
              : "attendance logs awaiting supervisors",
          detail: "Waiting for the assigned supervisor to verify.",
          to: "/coordinator/monitoring",
          icon: "clock",
          urgent: false,
        },
        {
          key: "tasks",
          count: data.tasks.awaitingReview,
          title:
            data.tasks.awaitingReview === 1
              ? "task submission awaiting a supervisor"
              : "task submissions awaiting supervisors",
          detail: "Submitted by students and not yet reviewed.",
          to: "/coordinator/monitoring",
          icon: "tasks",
          urgent: false,
        },
      ]
    : [];
  const attention = candidates.filter((item) => item.count > 0);
  const trendHours = data ? data.hoursTrend.reduce((sum, day) => sum + day.hours, 0) : 0;

  return (
    <CoordinatorLayout
      title="Dashboard"
      subtitle={`${greetingFor(new Date())}. Here is where the programme stands on ${formatLongDate(new Date())}.`}
    >
      <div className="space-y-6">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {loading ? (
            <div className="col-span-full">
              <BrandLoader role="coordinator" process="dashboard" />
            </div>
          ) : !data ? (
            [0, 1, 2, 3].map((tile) => <Skeleton key={tile} className="h-[104px] rounded-xl" />)
          ) : (
            <>
              <StatTile
                label="Timed in today"
                value={`${data.today.timedIn} of ${data.students.active}`}
                hint={`${data.today.onTheClock} on the clock now · ${data.today.absent} absent`}
                icon="clock"
                tone="gold"
              />
              <StatTile
                label="Active students"
                value={data.students.active}
                hint={`With ${plural(data.supervisors.active, "active supervisor")}`}
                icon="users"
              />
              <StatTile
                label="Verified hours"
                value={formatHours(data.totalHoursLogged)}
                hint={`${formatHours(data.weekHours)} in the last 7 days`}
                icon="check-circle"
                tone="good"
              />
              <StatTile
                label="Average completion"
                value={`${averageCompletion}%`}
                hint={
                  rows.length > 0
                    ? `${completed} of ${rows.length} have completed their hours`
                    : "No active students yet"
                }
                icon="chart"
              />
            </>
          )}
        </div>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
          <Card className="min-w-0 lg:col-span-3">
            <CardHeader
              title="Needs attention"
              description="What is waiting on you, and what is stuck with supervisors"
            />
            <div className="mt-3">
              {loading ? (
                <SkeletonRows rows={4} />
              ) : attention.length === 0 ? (
                <EmptyState
                  icon="check-circle"
                  title="Nothing needs attention"
                  description="No open complaints, flagged logs or waiting reviews."
                />
              ) : (
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {attention.map((item) => (
                    <li key={item.key}>
                      <Link
                        to={item.to}
                        className="flex items-center gap-4 px-4 py-3.5 hover:bg-slate-50 sm:px-5"
                      >
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${
                            item.urgent
                              ? "bg-red-50 text-red-600 ring-red-600/15"
                              : "bg-amber-50 text-amber-700 ring-amber-600/20"
                          }`}
                        >
                          <Icon name={item.icon} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-slate-900">
                            {item.count} {item.title}
                          </span>
                          <span className="block text-sm text-slate-600">{item.detail}</span>
                        </span>
                        <Icon name="chevron-right" size={16} className="shrink-0 text-slate-300" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card className="min-w-0 lg:col-span-2">
            <CardHeader
              title="Verified hours, last 14 days"
              description={loading ? undefined : `${formatHours(trendHours)} in total`}
              action={<CardLink to="/coordinator/analytics" label="Analytics" />}
            />
            <div className="px-4 pb-4 pt-7 sm:px-5">
              {loading || !data ? (
                <Skeleton className="h-36 w-full" />
              ) : trendHours === 0 ? (
                <p className="py-10 text-center text-sm text-slate-500">
                  No hours were verified in the last 14 days.
                </p>
              ) : (
                <ColumnChart
                  points={data.hoursTrend.map((day) => ({
                    key: day.day,
                    label: dayLabel(day.day),
                    value: day.hours,
                    detail: day.logs === 0 ? "No attendance logged" : plural(day.logs, "log"),
                  }))}
                  label="Verified hours per day over the last 14 days"
                  format={(value) => formatHours(value)}
                  height={130}
                  axis={false}
                />
              )}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
          <Card className="min-w-0">
            <CardHeader
              title="Progress toward required hours"
              description={
                loading ? undefined : `${plural(rows.length, "active student")}`
              }
              action={<CardLink to="/coordinator/monitoring" label="Monitoring" />}
            />
            <div className="px-4 pb-5 pt-5 sm:px-5">
              {loading ? (
                <Skeleton className="h-28 w-full" />
              ) : rows.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">No active students yet.</p>
              ) : (
                <ShareBar
                  label="Active students by progress toward their required hours"
                  segments={PROGRESS_BANDS.map((band) => ({
                    label: band.label,
                    color: band.color,
                    value: rows.filter((row) => band.holds(row.completion)).length,
                  }))}
                />
              )}
            </div>
          </Card>

          <Card className="min-w-0">
            <CardHeader
              title="Waiting with supervisors"
              description="Attendance logs and task submissions not yet reviewed"
            />
            <div className="mt-3">
              {loading ? (
                <SkeletonRows rows={3} />
              ) : supervisorQueues.length === 0 ? (
                <EmptyState icon="briefcase" title="No supervisors have interns yet" />
              ) : supervisorQueues.every((queue) => queue.waiting === 0) ? (
                <EmptyState
                  icon="check-circle"
                  title="Supervisors are caught up"
                  description="No logs or submissions are waiting for review."
                />
              ) : (
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {supervisorQueues.slice(0, 5).map((queue) => (
                    <li
                      key={queue.name}
                      className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{queue.name}</p>
                        <p className="text-xs text-slate-500">
                          {plural(queue.interns, "intern")} · {plural(queue.logs, "log")} ·{" "}
                          {plural(queue.tasks, "task")}
                        </p>
                      </div>
                      <span
                        className={`tabular shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                          queue.waiting > 0
                            ? "bg-amber-50 text-amber-800 ring-amber-600/25"
                            : "bg-slate-100 text-slate-500 ring-slate-500/15"
                        }`}
                      >
                        {queue.waiting} waiting
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card className="min-w-0">
            <CardHeader
              title="Students to check on"
              description="Flagged logs or overdue tasks"
            />
            <div className="mt-3">
              {loading ? (
                <SkeletonRows rows={3} />
              ) : watchList.length === 0 ? (
                <EmptyState icon="check-circle" title="No students flagged" />
              ) : (
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {watchList.map((row) => (
                    <li key={row.student_id} className="px-4 py-3.5 sm:px-5">
                      <div className="flex items-baseline justify-between gap-3">
                        <Link
                          to={`/coordinator/students/${encodeURIComponent(row.student_id)}`}
                          className="truncate text-sm font-medium text-slate-900 hover:text-psu-700 hover:underline"
                        >
                          {row.name}
                        </Link>
                        <p className="shrink-0 text-xs font-semibold text-red-600">
                          {[
                            row.flagged_logs > 0 &&
                              `${row.flagged_logs} flagged ${row.flagged_logs === 1 ? "log" : "logs"}`,
                            row.overdue_tasks > 0 && `${row.overdue_tasks} overdue`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <p className="truncate text-xs text-slate-500">
                        {row.company || "No company"} · {row.supervisor_name || "No supervisor"}
                      </p>
                      <div className="mt-2 flex items-center gap-3">
                        <ProgressBar value={row.completion} label={`${row.completion} percent`} />
                        <span className="tabular shrink-0 text-xs text-slate-600">
                          {row.completion}%
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>
    </CoordinatorLayout>
  );
}

function CardLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-sm font-semibold text-psu-700 hover:underline"
    >
      {label}
      <Icon name="chevron-right" size={14} />
    </Link>
  );
}
