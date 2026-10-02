import { useCallback, useEffect, useMemo, useState } from "react";
import AttendancePhoto from "../../components/AttendancePhoto";
import DateRangeFilter from "../../components/DateRangeFilter";
import Icon from "../../components/Icon";
import Pagination from "../../components/Pagination";
import Tooltip from "../../components/Tooltip";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  FilterChips,
  FormError,
  Modal,
  ProgressBar,
  SearchField,
  SkeletonRows,
  StatusBadge,
} from "../../components/ui";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import { isWithinDateRange } from "../../lib/dateRange";
import {
  formatDate,
  formatDayDate,
  formatHours,
  formatLongDate,
  formatTime,
} from "../../lib/format";
import { notifyDataChanged } from "../../lib/navCounts";
import { errorText, toast } from "../../lib/toast";
import { usePagination } from "../../lib/usePagination";
import AbsenceList from "./AbsenceList";
import { coordinatorRequest } from "./request";

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
  /** When verified hours first reached the requirement, if they have. */
  completed_at: string | null;
};

type Discrepancy = {
  id: number;
  student_id: string;
  student_name: string;
  company: string | null;
  supervisor_name: string | null;
  date: string;
  time_in: string | null;
  break_time: string | null;
  break_end_time: string | null;
  time_out: string | null;
  hours: number | string | null;
  note: string | null;
  status: string;
  image_url: string | null;
  review_notes: string | null;
  correction_note: string | null;
  reasons: string[];
};

type Scope = "all" | "attention";

const needsAttention = (row: MonitorRow) => row.flagged_logs > 0 || row.overdue_tasks > 0;

export default function CoordinatorMonitoring() {
  const [rows, setRows] = useState<MonitorRow[]>([]);
  const [flags, setFlags] = useState<Discrepancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [scope, setScope] = useState<Scope>("all");
  const [query, setQuery] = useState("");
  const [focusStudent, setFocusStudent] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [reviewingId, setReviewingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [monitoring, discrepancies] = await Promise.all([
        coordinatorRequest<{ students: MonitorRow[] }>("/api/coordinator/monitoring"),
        coordinatorRequest<{ discrepancies: Discrepancy[] }>("/api/coordinator/discrepancies"),
      ]);
      setRows(monitoring.students || []);
      setFlags(discrepancies.discrepancies || []);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load monitoring data."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const refresh = () => {
      void load();
    };
    refresh();
    window.addEventListener("internet-notification", refresh);
    return () => window.removeEventListener("internet-notification", refresh);
  }, [load]);

  const text = query.trim().toLowerCase();

  const visibleRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          (scope === "all" || needsAttention(row)) &&
          (!text ||
            [row.name, row.student_id, row.company, row.program, row.supervisor_name]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(text)))
      ),
    [rows, scope, text]
  );

  const visibleFlags = useMemo(
    () =>
      flags.filter(
        (flag) =>
          (!focusStudent || flag.student_id === focusStudent) &&
          isWithinDateRange(flag.date, dateFrom, dateTo) &&
          (!text ||
            [flag.student_name, flag.student_id, flag.company, flag.supervisor_name]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(text)))
      ),
    [flags, focusStudent, dateFrom, dateTo, text]
  );

  const rowPager = usePagination(visibleRows, 20);
  const flagPager = usePagination(visibleFlags, 10);
  const focused = rows.find((row) => row.student_id === focusStudent);
  const attentionCount = rows.filter(needsAttention).length;

  const showFlags = (studentId: string) => {
    setFocusStudent(studentId);
    document.getElementById("flagged-logs")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <CoordinatorLayout
      title="Monitoring"
      subtitle="Hours, tasks and attendance problems for every active student."
    >
      <div className="space-y-6">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        <Card>
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4 sm:p-5">
            <SearchField
              value={query}
              onChange={setQuery}
              label="Search students"
              placeholder="Search by student, company or supervisor"
              className="w-full sm:w-80"
            />
            <FilterChips
              label="Which students"
              value={scope}
              onChange={setScope}
              options={[
                { value: "all", label: "All students", count: rows.length },
                { value: "attention", label: "Needs attention", count: attentionCount },
              ]}
            />
          </div>

          {loading ? (
            <SkeletonRows rows={6} />
          ) : visibleRows.length === 0 ? (
            <EmptyState
              icon={rows.length === 0 ? "users" : "search"}
              title={rows.length === 0 ? "No active students" : "No students match"}
              description={
                rows.length === 0 ? "Register students to start monitoring them." : undefined
              }
            />
          ) : (
            <>
              {/* Small screens: one card per student */}
              <ul className="divide-y divide-slate-100 lg:hidden">
                {rowPager.pageItems.map((row) => (
                  <li key={row.student_id} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {row.name}
                          {row.completed_at && (
                            <span className="ml-2 text-xs font-semibold text-emerald-700">
                              Hours completed
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {row.company || "No company"} · {row.supervisor_name || "No supervisor"}
                        </p>
                      </div>
                      <AttendanceState row={row} onShow={() => showFlags(row.student_id)} />
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <ProgressBar value={row.completion} label={`${row.completion} percent`} />
                      <span className="tabular shrink-0 text-xs text-slate-600">
                        {formatHours(row.hours_rendered)} / {formatHours(row.required_hours)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-600">
                      <TaskSummary row={row} />
                    </p>
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs text-slate-500">
                      <th scope="col" className="px-5 py-3 font-medium">Student</th>
                      <th scope="col" className="px-3 py-3 font-medium">Supervisor</th>
                      <th scope="col" className="px-3 py-3 font-medium">Hours</th>
                      <th scope="col" className="px-3 py-3 font-medium">Tasks</th>
                      <th scope="col" className="px-3 py-3 font-medium">Last log</th>
                      <th scope="col" className="px-5 py-3 font-medium">Attendance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rowPager.pageItems.map((row) => (
                      <tr key={row.student_id} className="hover:bg-slate-50">
                        <td className="px-5 py-3">
                          <p className="font-medium text-slate-900">
                            {row.name}
                            {row.completed_at && (
                              <span className="ml-2 inline-flex">
                                <StatusBadge status="Hours completed" tone="good" />
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500">
                            {[row.program, row.company].filter(Boolean).join(" · ") ||
                              row.student_id}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {row.supervisor_name || (
                            <span className="font-medium text-red-600">Unassigned</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex w-44 items-center gap-2.5">
                            <ProgressBar
                              value={row.completion}
                              label={`${row.completion} percent`}
                            />
                            <span className="tabular shrink-0 text-xs text-slate-600">
                              {row.completion}%
                            </span>
                          </div>
                          <p className="tabular mt-1 text-xs text-slate-500">
                            {formatHours(row.hours_rendered)} of {formatHours(row.required_hours)}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          <TaskSummary row={row} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                          {row.last_log_date ? formatDate(row.last_log_date) : "Never"}
                        </td>
                        <td className="px-5 py-3">
                          <AttendanceState row={row} onShow={() => showFlags(row.student_id)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination state={rowPager} noun="student" />
            </>
          )}
        </Card>

        <Card>
          <div id="flagged-logs" className="scroll-mt-4">
            <CardHeader
              title={focused ? `Flagged logs for ${focused.name}` : "Flagged attendance logs"}
              description="Rejected logs, logs with no time-out, and logs left unverified for more than 2 days."
              action={
                focusStudent ? (
                  <button
                    type="button"
                    onClick={() => setFocusStudent(null)}
                    className="text-sm font-semibold text-psu-700 hover:underline"
                  >
                    Show all students
                  </button>
                ) : undefined
              }
            />
          </div>
          <div className="border-b border-slate-100 px-4 pb-4 pt-3 sm:px-5">
            <DateRangeFilter
              from={dateFrom}
              to={dateTo}
              onChange={(from, to) => {
                setDateFrom(from);
                setDateTo(to);
              }}
            />
          </div>
          {loading ? (
            <SkeletonRows rows={3} />
          ) : visibleFlags.length === 0 ? (
            <EmptyState
              icon="check-circle"
              title={flags.length === 0 ? "No flagged logs" : "No flagged logs match"}
            />
          ) : (
            <>
            <ul className="divide-y divide-slate-100">
              {flagPager.pageItems.map((flag) => (
                <li
                  key={flag.id}
                  className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {flag.student_name}
                      <span className="tabular font-normal text-slate-500">
                        {" "}
                        · {formatDayDate(flag.date)} · {formatTime(flag.time_in)} –{" "}
                        {formatTime(flag.time_out)}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {flag.company || "No company"} · Supervisor:{" "}
                      {flag.supervisor_name || "unassigned"}
                    </p>
                    {flag.review_notes && (
                      <p className="mt-1 text-sm text-slate-600">
                        <span className="font-medium">Supervisor's note:</span>{" "}
                        {flag.review_notes}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {flag.reasons.map((reason) => (
                      <StatusBadge key={reason} status={reason} tone="bad" />
                    ))}
                    <button
                      type="button"
                      onClick={() => setReviewingId(flag.id)}
                      className="ml-1 inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm font-semibold text-psu-700 hover:bg-psu-50"
                    >
                      Review
                      <Icon name="chevron-right" size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination state={flagPager} noun="flagged log" />
            </>
          )}
        </Card>

        <AbsenceList search={query} />
      </div>

      <FlaggedLogDialog
        key={reviewingId ?? "closed"}
        flag={flags.find((flag) => flag.id === reviewingId) ?? null}
        onClose={() => setReviewingId(null)}
        onDecided={() => {
          setReviewingId(null);
          notifyDataChanged();
          void load();
        }}
      />
    </CoordinatorLayout>
  );
}

/*
|--------------------------------------------------------------------------
| REVIEW A FLAGGED LOG
|--------------------------------------------------------------------------
|
| Flagged logs are the ones a supervisor has not settled: rejected, left
| open, or ignored for days. The coordinator can step in and decide.
|
*/

function FlaggedLogDialog({
  flag,
  onClose,
  onDecided,
}: {
  flag: Discrepancy | null;
  onClose: () => void;
  onDecided: () => void;
}) {
  const [reason, setReason] = useState("");
  const [reasonOpen, setReasonOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  if (!flag) return null;

  const open = !flag.time_out;
  const rejected = flag.status === "Rejected";

  const decide = async (status: "Verified" | "Rejected" | "Pending") => {
    if (status === "Rejected" && !reason.trim()) {
      setReasonOpen(true);
      setError("Write a reason first. The student will see it.");
      return;
    }
    setBusy(status);
    setError("");
    try {
      await coordinatorRequest(`/api/attendance/${flag.id}/status`, {
        method: "PATCH",
        body: { status, reason: reason.trim() || undefined },
      });
      toast.success(
        status === "Verified"
          ? `${flag.student_name}'s log for ${formatDate(flag.date)} verified.`
          : status === "Rejected"
            ? `Log rejected. ${flag.student_name} has been notified.`
            : "Log returned to the supervisor's queue."
      );
      onDecided();
    } catch (decisionError) {
      setError(errorText(decisionError, "The log could not be updated."));
      setBusy(null);
    }
  };

  return (
    <Modal
      open
      onClose={() => busy === null && onClose()}
      title={flag.student_name}
      description={`${formatLongDate(flag.date)} · Supervisor: ${flag.supervisor_name || "unassigned"}`}
      locked={busy !== null}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy !== null}>
            Close
          </Button>
          {rejected && (
            <Button
              variant="secondary"
              onClick={() => void decide("Pending")}
              busy={busy === "Pending"}
              disabled={busy !== null}
            >
              Return to supervisor
            </Button>
          )}
          {!rejected && (
            <Button
              variant="secondary"
              onClick={() => void decide("Rejected")}
              busy={busy === "Rejected"}
              disabled={busy !== null}
              className="text-red-700"
            >
              Reject
            </Button>
          )}
          <Button
            icon="check"
            onClick={() => void decide("Verified")}
            busy={busy === "Verified"}
            disabled={busy !== null || open}
          >
            {rejected ? "Verify instead" : "Verify"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-1.5">
          {flag.reasons.map((item) => (
            <StatusBadge key={item} status={item} tone="bad" />
          ))}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">Time in</dt>
            <dd className="tabular text-slate-800">{formatTime(flag.time_in)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Break</dt>
            <dd className="tabular text-slate-800">
              {flag.break_time
                ? `${formatTime(flag.break_time)} – ${
                    flag.break_end_time ? formatTime(flag.break_end_time) : "…"
                  }`
                : "None"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Time out</dt>
            <dd className="tabular text-slate-800">
              {open ? "Not recorded" : formatTime(flag.time_out)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Hours</dt>
            <dd className="tabular font-semibold text-slate-900">
              {open ? "—" : formatHours(flag.hours)}
            </dd>
          </div>
        </dl>

        {open && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <Icon name="clock" size={16} className="mt-0.5 shrink-0" />
            This log has no time-out, so it cannot be verified yet. The student can enter the
            missed time-out from their Attendance page; you can also reject the log.
          </p>
        )}

        {flag.note && (
          <p className="border-l-2 border-slate-200 pl-3 text-sm text-slate-700">{flag.note}</p>
        )}
        {flag.review_notes && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            <span className="font-semibold">Supervisor's reason:</span> {flag.review_notes}
          </p>
        )}
        {flag.correction_note && (
          <p className="rounded-md bg-psu-50 px-3 py-2 text-sm text-psu-900">
            <span className="font-semibold">Student:</span> {flag.correction_note}
          </p>
        )}

        <AttendancePhoto path={flag.image_url} role="coordinator" />

        {reasonOpen && (
          <div>
            <label
              htmlFor="flag-reason"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Reason for rejecting
            </label>
            <textarea
              id="flag-reason"
              rows={3}
              maxLength={1000}
              autoFocus
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                if (event.target.value.trim()) setError("");
              }}
              className="field resize-none"
            />
          </div>
        )}

        <FormError message={error} />
      </div>
    </Modal>
  );
}

function TaskSummary({ row }: { row: MonitorRow }) {
  return (
    <>
      {row.active_tasks} open
      {row.tasks_awaiting_review > 0 && (
        <span className="text-amber-700"> · {row.tasks_awaiting_review} to review</span>
      )}
      {row.overdue_tasks > 0 && (
        <span className="font-semibold text-red-600"> · {row.overdue_tasks} overdue</span>
      )}
    </>
  );
}

function AttendanceState({ row, onShow }: { row: MonitorRow; onShow: () => void }) {
  if (row.flagged_logs > 0) {
    return (
      <Tooltip
        side="left"
        label={`${row.rejected_logs} rejected, ${row.missing_timeout_logs} missing a time-out, ${row.stale_pending_logs} unverified for more than 2 days. Click to see them.`}
      >
        <button
          type="button"
          onClick={onShow}
          className="shrink-0 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-600/20 hover:bg-red-100"
        >
          {row.flagged_logs} flagged
        </button>
      </Tooltip>
    );
  }
  if (row.pending_logs > 0) {
    return <StatusBadge status={`${row.pending_logs} pending`} tone="waiting" />;
  }
  return <StatusBadge status="Clear" tone="good" />;
}
