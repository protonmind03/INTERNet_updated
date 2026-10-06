import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import { formatHours, greetingFor } from "../../lib/format";
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
};

type MonitorRow = {
  student_id: string;
  name: string;
  company: string | null;
  supervisor_name: string | null;
  required_hours: number;
  hours_rendered: number;
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

function accountsText(total: number): string {
  return `${total} ${total === 1 ? "account" : "accounts"} in total`;
}

export default function CoordinatorDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [rows, setRows] = useState<MonitorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const unassigned = rows.filter((row) => !row.supervisor_name).length;
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

  return (
    <CoordinatorLayout
      title="Dashboard"
      subtitle={`${greetingFor(new Date())}. Here is where the programme stands.`}
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
                label="Active students"
                value={data.students.active}
                hint={accountsText(data.students.total)}
                icon="users"
              />
              <StatTile
                label="Active supervisors"
                value={data.supervisors.active}
                hint={accountsText(data.supervisors.total)}
                icon="briefcase"
              />
              <StatTile
                label="Verified hours"
                value={formatHours(data.totalHoursLogged)}
                hint={`${averageCompletion}% average completion`}
                icon="clock"
                tone="gold"
              />
              <StatTile
                label="Tasks reviewed"
                value={`${data.tasks.completed} of ${data.tasks.total}`}
                hint={
                  data.tasks.total > 0
                    ? `${Math.round((data.tasks.completed / data.tasks.total) * 100)}% complete`
                    : "No tasks assigned yet"
                }
                icon="tasks"
                tone="good"
              />
            </>
          )}
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
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

          <Card className="lg:col-span-2">
            <CardHeader
              title="Students to check on"
              description="Flagged logs or overdue tasks"
              action={
                <Link
                  to="/coordinator/monitoring"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-psu-700 hover:underline"
                >
                  Monitoring
                  <Icon name="chevron-right" size={14} />
                </Link>
              }
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
