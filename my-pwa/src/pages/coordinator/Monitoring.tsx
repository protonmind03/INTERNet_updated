import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CoordinatorLayout from "./CoordinatorLayout";
import { API_URL, withCoordinatorAuth } from "../../lib/api";
import { isWithinDateRange } from "../../lib/dateRange";
import DateRangeFilter from "../../components/DateRangeFilter";

type MonitorRow = {
  student_id: string;
  name: string;
  program: string | null;
  company: string | null;
  required_hours: number;
  supervisor_name: string | null;
  hours_rendered: number;
  pending_logs: number;
  rejected_logs: number;
  missing_timeout_logs: number;
  stale_pending_logs: number;
  flagged_logs: number;
  last_log_date: string | null;
  active_tasks: number;
  tasks_awaiting_review: number;
  overdue_tasks: number;
  completion: number;
};

type Discrepancy = {
  id: number;
  student_id: string;
  student_name: string;
  company: string | null;
  supervisor_name: string | null;
  date: string;
  time_in: string | null;
  time_out: string | null;
  status: string;
  review_notes: string | null;
  reasons: string[];
};

function formatTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CoordinatorMonitoring() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<MonitorRow[]>([]);
  const [flags, setFlags] = useState<Discrepancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [query, setQuery] = useState("");
  const [focusStudent, setFocusStudent] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const [monitorResponse, flagResponse] = await Promise.all([
          fetch(`${API_URL}/api/coordinator/monitoring`, withCoordinatorAuth()),
          fetch(
            `${API_URL}/api/coordinator/discrepancies`,
            withCoordinatorAuth()
          ),
        ]);

        if (monitorResponse.status === 401 || flagResponse.status === 401) {
          navigate("/");
          return;
        }

        const data = await monitorResponse.json();
        const flagData = await flagResponse.json();

        if (!monitorResponse.ok) {
          setError(data.message || "Failed to load monitoring data.");
          return;
        }

        setRows(data.students || []);
        setFlags(flagResponse.ok ? flagData.discrepancies || [] : []);
      } catch {
        setError("Unable to connect to the server.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [navigate]);

  const needle = query.trim().toLowerCase();
  const visibleRows = rows
    .filter(
      (r) =>
        !onlyFlagged ||
        r.flagged_logs > 0 ||
        r.pending_logs > 0 ||
        r.overdue_tasks > 0
    )
    .filter(
      (r) =>
        !needle ||
        [r.name, r.student_id, r.company, r.program, r.supervisor_name]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle))
    );

  // Flagged logs follow the same text filter as the table, plus a date range.
  const visibleFlags = flags.filter(
    (f) =>
      (!focusStudent || f.student_id === focusStudent) &&
      isWithinDateRange(f.date, dateFrom, dateTo) &&
      (!needle ||
        [f.student_name, f.student_id, f.company, f.supervisor_name, f.status]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle)))
  );

  return (
    <CoordinatorLayout
      title="OJT Monitoring"
      subtitle="Review attendance, task, and progress status across all students"
      breadcrumb={["Coordinator", "Overview", "Monitoring"]}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by student, ID, company, program, or supervisor"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 sm:max-w-sm"
          />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={onlyFlagged}
              onChange={(e) => setOnlyFlagged(e.target.checked)}
              className="rounded border-slate-300"
            />
            Only students needing attention
          </label>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Student</th>
                <th className="px-4 py-3 font-medium">Supervisor</th>
                <th className="px-4 py-3 font-medium">Progress</th>
                <th className="px-4 py-3 font-medium">Tasks</th>
                <th className="px-4 py-3 font-medium">Awaiting Review</th>
                <th className="px-4 py-3 font-medium">Attendance Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Loading monitoring data...
                  </td>
                </tr>
              )}

              {!loading && error && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-red-400">
                    {error}
                  </td>
                </tr>
              )}

              {!loading && !error && visibleRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No students match this filter.
                  </td>
                </tr>
              )}

              {!loading &&
                !error &&
                visibleRows.map((r) => (
                  <tr key={r.student_id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{r.name}</p>
                      <p className="text-xs text-slate-400">
                        {r.program || "—"} · {r.company || "—"}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Last log: {r.last_log_date || "none"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {r.supervisor_name || "Unassigned"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{ width: `${r.completion}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500">
                          {r.hours_rendered}/{r.required_hours}h
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {r.active_tasks} active
                      {r.overdue_tasks > 0 && (
                        <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-500">
                          {r.overdue_tasks} overdue
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.tasks_awaiting_review > 0 ? (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-600">
                          {r.tasks_awaiting_review} pending
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.flagged_logs > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setFocusStudent(
                              focusStudent === r.student_id
                                ? null
                                : r.student_id
                            )
                          }
                          title={`${r.rejected_logs} rejected · ${r.missing_timeout_logs} missing time-out · ${r.stale_pending_logs} unverified > 2 days`}
                          className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-100"
                        >
                          {r.flagged_logs} flagged
                        </button>
                      ) : r.pending_logs > 0 ? (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                          {r.pending_logs} pending
                        </span>
                      ) : (
                        <span className="text-emerald-500">Clear</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {!loading && !error && (
          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">
                  Flagged discrepancies
                </h2>
                <p className="text-xs text-slate-400">
                  Rejected logs, logs with no time-out, and logs unverified
                  for more than 2 days.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <DateRangeFilter
                  from={dateFrom}
                  to={dateTo}
                  onChange={(from, to) => {
                    setDateFrom(from);
                    setDateTo(to);
                  }}
                />
                {focusStudent && (
                  <button
                    type="button"
                    onClick={() => setFocusStudent(null)}
                    className="text-xs font-medium text-indigo-600 hover:underline"
                  >
                    Show all students
                  </button>
                )}
              </div>
            </div>
            {visibleFlags.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">
                {flags.length === 0
                  ? "No flagged attendance logs."
                  : "No flagged logs match these filters."}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {visibleFlags.map((f) => (
                  <li
                    key={f.id}
                    className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {f.student_name}{" "}
                        <span className="font-normal text-slate-400">
                          · {f.date} · in {formatTime(f.time_in)} / out{" "}
                          {formatTime(f.time_out)}
                        </span>
                      </p>
                      <p className="text-xs text-slate-400">
                        {f.company || "—"} · Supervisor:{" "}
                        {f.supervisor_name || "Unassigned"}
                        {f.review_notes ? ` · Review: ${f.review_notes}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {f.reasons.map((reason) => (
                        <span
                          key={reason}
                          className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-500"
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </CoordinatorLayout>
  );
}
