import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import CoordinatorLayout from "./CoordinatorLayout";
import { API_URL, withCoordinatorAuth } from "../../lib/api";

type DashboardData = {
  students: { active: number; total: number };
  supervisors: { active: number; total: number };
  pendingAttendance: number;
  flaggedAttendance: number;
  pendingComplaints: number;
  tasks: { awaitingReview: number; completed: number; total: number };
  totalHoursLogged: number;
};

const CARD_THEMES = {
  neutral: "border border-slate-200 bg-white",
  indigo: "bg-gradient-to-br from-indigo-600 to-indigo-500 text-white",
  amber: "bg-gradient-to-br from-amber-500 to-orange-500 text-white",
  red: "bg-gradient-to-br from-red-500 to-rose-500 text-white",
  emerald: "bg-gradient-to-br from-emerald-500 to-teal-500 text-white",
} as const;

function StatCard({
  label,
  value,
  hint,
  theme = "neutral",
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  theme?: keyof typeof CARD_THEMES;
  icon?: ReactNode;
}) {
  const colored = theme !== "neutral";

  return (
    <div className={`rounded-xl p-4 ${CARD_THEMES[theme]}`}>
      <div className="flex items-start justify-between">
        <p
          className={`text-xs font-medium ${
            colored ? "text-white/80" : "text-slate-400"
          }`}
        >
          {label}
        </p>
        {icon && (
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-lg ${
              colored ? "bg-white/15" : "bg-slate-100"
            }`}
          >
            {icon}
          </div>
        )}
      </div>
      <p
        className={`mt-1.5 text-2xl font-semibold ${
          colored ? "text-white" : "text-slate-900"
        }`}
      >
        {value}
      </p>
      <div className="mt-1 flex items-center gap-1.5">
        {hint && (
          <p className={`text-xs ${colored ? "text-white/75" : "text-slate-400"}`}>
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

function CardIcon({ path }: { path: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d={path} />
    </svg>
  );
}

export default function CoordinatorDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `${API_URL}/api/coordinator/dashboard`,
          withCoordinatorAuth()
        );

        if (response.status === 401) {
          navigate("/");
          return;
        }

        const result = await response.json();

        if (!response.ok) {
          setError(result.message || "Failed to load dashboard.");
          return;
        }

        setData(result);
      } catch {
        setError("Unable to connect to the server.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [navigate]);

  return (
    <CoordinatorLayout
      title="Dashboard"
      subtitle="System-wide overview of every student, supervisor, and OJT activity"
      breadcrumb={["Coordinator", "Dashboard"]}
    >
      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
          Loading dashboard...
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-red-200 bg-white p-10 text-center text-sm text-red-400">
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              theme="indigo"
              label="Active Students"
              value={data.students.active}
              hint={`${data.students.total} total accounts`}
              icon={<CardIcon path="M12 3l2.7 5.8 6.3.6-4.8 4.2 1.4 6.2L12 16.9 6.4 19.8l1.4-6.2L3 9.4l6.3-.6L12 3Z" />}
            />
            <StatCard
              label="Active Supervisors"
              value={data.supervisors.active}
              hint={`${data.supervisors.total} total accounts`}
              icon={<CardIcon path="M3 7h18M3 7v13h18V7M3 7l2-4h14l2 4" />}
            />
            <StatCard
              theme="emerald"
              label="Hours Logged"
              value={data.totalHoursLogged.toLocaleString()}
              hint="Verified attendance hours"
              icon={<CardIcon path="M12 8v4l3 3M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />}
            />
            <StatCard
              theme="amber"
              label="Pending Attendance"
              value={data.pendingAttendance}
              hint="Awaiting confirmation"
              icon={<CardIcon path="M12 8v4l3 3M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <StatCard
              theme="red"
              label="Flagged / Rejected Logs"
              value={data.flaggedAttendance}
              hint="Discrepancies to review"
              icon={<CardIcon path="M5 21V4M5 4h13l-3 4 3 4H5" />}
            />
            <StatCard
              theme="red"
              label="Pending Complaints"
              value={data.pendingComplaints}
              hint="Awaiting resolution"
              icon={<CardIcon path="M10.3 3.9 2.7 17a1.8 1.8 0 0 0 1.5 2.7h15.6a1.8 1.8 0 0 0 1.5-2.7L13.7 3.9a2 2 0 0 0-3.4 0ZM12 9v4M12 16.5h.01" />}
            />
            <StatCard
              label="Tasks Awaiting Review"
              value={data.tasks.awaitingReview}
              hint={`${data.tasks.completed} of ${data.tasks.total} completed`}
              icon={<CardIcon path="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <button
              type="button"
              onClick={() => navigate("/coordinator/monitoring")}
              className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-indigo-300 hover:bg-indigo-50/40"
            >
              <p className="text-sm font-semibold text-slate-800">
                Monitor OJT progress
              </p>
              <p className="mt-1 text-xs text-slate-400">
                See every student's hours, tasks, and flagged logs in one
                table.
              </p>
            </button>

            <button
              type="button"
              onClick={() => navigate("/coordinator/complaints")}
              className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-indigo-300 hover:bg-indigo-50/40"
            >
              <p className="text-sm font-semibold text-slate-800">
                Resolve complaints
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Review filed incidents and mark them resolved or dismissed.
              </p>
            </button>

            <button
              type="button"
              onClick={() => navigate("/coordinator/students")}
              className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-indigo-300 hover:bg-indigo-50/40"
            >
              <p className="text-sm font-semibold text-slate-800">
                Manage accounts
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Register, edit, or deactivate student and supervisor
                accounts.
              </p>
            </button>
          </div>
        </div>
      )}
    </CoordinatorLayout>
  );
}
