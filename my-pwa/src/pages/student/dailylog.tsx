import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DateRangeFilter from "../../components/DateRangeFilter";
import Icon from "../../components/Icon";
import Pagination from "../../components/Pagination";
import {
  Card,
  EmptyState,
  ErrorNotice,
  FilterChips,
  Modal,
  SkeletonRows,
  StatTile,
  StatusBadge,
} from "../../components/ui";
import { BrandLoader } from "../../brand";
import StudentLayout from "../../layouts/StudentLayout";
import { getProtectedUploadUrl } from "../../lib/api";
import { isWithinDateRange } from "../../lib/dateRange";
import {
  formatDayDate,
  formatHours,
  formatLongDate,
  formatTime,
  localDateKey,
} from "../../lib/format";
import { useAccount } from "../../lib/session";
import { usePagination } from "../../lib/usePagination";
import Absences from "./Absences";
import {
  LateTimeOutDialog,
  MissedTimeOutNotice,
  ResubmitDialog,
} from "./AttendanceCorrections";
import TodayAttendance from "./TodayAttendance";
import { logDateKey, useAttendance, type AttendanceLog } from "./useAttendance";

type Filter = "All" | "Verified" | "Pending" | "Rejected";

/** Supervisors may mark a log "Flagged" or "Rejected"; students see one group. */
function matchesFilter(log: AttendanceLog, filter: Filter): boolean {
  if (filter === "All") return true;
  if (filter === "Rejected") return log.status === "Rejected" || log.status === "Flagged";
  return log.status === filter;
}

export default function DailyLog() {
  const student = useAccount("student");
  const attendance = useAttendance(student?.student_id);
  const { logs, loading } = attendance;

  const [filter, setFilter] = useState<Filter>("All");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [photoLog, setPhotoLog] = useState<AttendanceLog | null>(null);
  const [resubmitting, setResubmitting] = useState<AttendanceLog | null>(null);
  const [closing, setClosing] = useState<AttendanceLog | null>(null);

  const today = localDateKey(new Date());
  /** What the student can do about a log that is not in order, if anything. */
  const fixFor = (log: AttendanceLog): { label: string; run: () => void } | null => {
    if (!log.time_out && logDateKey(log) < today) {
      return { label: "Enter time-out", run: () => setClosing(log) };
    }
    if (log.status === "Rejected") {
      return { label: "Ask for another review", run: () => setResubmitting(log) };
    }
    return null;
  };

  const counts = useMemo(
    () => ({
      All: logs.length,
      Verified: logs.filter((log) => matchesFilter(log, "Verified")).length,
      Pending: logs.filter((log) => matchesFilter(log, "Pending")).length,
      Rejected: logs.filter((log) => matchesFilter(log, "Rejected")).length,
    }),
    [logs]
  );

  const verifiedHours = useMemo(
    () =>
      logs
        .filter((log) => log.status === "Verified")
        .reduce((sum, log) => sum + (Number(log.hours) || 0), 0),
    [logs]
  );

  const visibleLogs = useMemo(() => {
    const text = search.trim().toLowerCase();
    return logs.filter((log) => {
      if (!matchesFilter(log, filter)) return false;
      const key = logDateKey(log);
      if (!isWithinDateRange(key, dateFrom, dateTo)) return false;
      if (!text) return true;
      return [key, formatDayDate(key), log.note, log.review_notes, log.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(text));
    });
  }, [logs, filter, search, dateFrom, dateTo]);

  const filtered = filter !== "All" || search.trim() !== "" || dateFrom !== "" || dateTo !== "";

  const pager = usePagination(visibleLogs, 15);

  const clearFilters = () => {
    setFilter("All");
    setSearch("");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <StudentLayout
      title="Attendance"
      subtitle="Time in and out each day, and follow what your supervisor has verified."
      actions={
        <Link
          to="/time-record"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Icon name="printer" size={16} />
          Time record
        </Link>
      }
    >
      <div className="space-y-5">
        {attendance.error && (
          <ErrorNotice message={attendance.error} onRetry={() => void attendance.reload()} />
        )}

        <MissedTimeOutNotice attendance={attendance} />

        <TodayAttendance attendance={attendance} />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Days logged" value={loading ? "–" : counts.All} icon="calendar" />
          <StatTile
            label="Verified hours"
            value={loading ? "–" : formatHours(verifiedHours)}
            icon="check-circle"
            tone="good"
          />
          <StatTile
            label="Awaiting verification"
            value={loading ? "–" : counts.Pending}
            icon="clock"
            tone={!loading && counts.Pending > 0 ? "waiting" : "neutral"}
          />
          <StatTile
            label="Rejected"
            value={loading ? "–" : counts.Rejected}
            icon="alert"
            tone={!loading && counts.Rejected > 0 ? "bad" : "neutral"}
          />
        </div>

        <Card>
          <div className="space-y-3 border-b border-slate-100 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900">Attendance history</h2>
              <label className="relative block w-full sm:w-64">
                <span className="sr-only">Search attendance</span>
                <Icon
                  name="search"
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search notes or dates"
                  className="field pl-9"
                />
              </label>
            </div>
            <FilterChips
              label="Filter by status"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "All", label: "All", count: counts.All },
                { value: "Verified", label: "Verified", count: counts.Verified },
                { value: "Pending", label: "Pending", count: counts.Pending },
                { value: "Rejected", label: "Rejected", count: counts.Rejected },
              ]}
            />
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
            <SkeletonRows rows={5} />
          ) : visibleLogs.length === 0 ? (
            filtered ? (
              <EmptyState
                icon="search"
                title="No logs match these filters"
                action={
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-sm font-semibold text-psu-700 hover:underline"
                  >
                    Clear filters
                  </button>
                }
              />
            ) : (
              <EmptyState
                icon="clock"
                title="No attendance yet"
                description="Time in above to record your first day."
              />
            )
          ) : (
            <>
              {/* Phones: one card per day */}
              <ul className="divide-y divide-slate-100 md:hidden">
                {pager.pageItems.map((log) => (
                  <li key={log.id} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {formatDayDate(logDateKey(log))}
                        </p>
                        <p className="tabular mt-0.5 text-sm text-slate-600">
                          {formatTime(log.time_in)} – {formatTime(log.time_out)}
                        </p>
                      </div>
                      <StatusBadge status={log.status} />
                    </div>
                    <div className="mt-3 flex items-end gap-6 text-sm">
                      <dl className="flex gap-6">
                        <div>
                          <dt className="text-xs text-slate-500">Hours</dt>
                          <dd className="tabular font-medium text-slate-900">
                            {formatHours(log.hours)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500">Break</dt>
                          <dd className="tabular whitespace-nowrap text-slate-700">
                            {breakText(log)}
                          </dd>
                        </div>
                      </dl>
                      {log.image_url && (
                        <div className="ml-auto">
                          <PhotoButton onClick={() => setPhotoLog(log)} />
                        </div>
                      )}
                    </div>
                    <LogNotes log={log} />
                    <FixButton fix={fixFor(log)} />
                  </li>
                ))}
              </ul>

              {/* Larger screens: a table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="table-head border-b border-slate-100 text-xs font-medium text-slate-500">
                      <th scope="col" className="px-5 py-3 font-medium">Date</th>
                      <th scope="col" className="px-3 py-3 font-medium">Time in</th>
                      <th scope="col" className="px-3 py-3 font-medium">Break</th>
                      <th scope="col" className="px-3 py-3 font-medium">Time out</th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">Hours</th>
                      <th scope="col" className="px-3 py-3 font-medium">Notes</th>
                      <th scope="col" className="px-3 py-3 font-medium">Status</th>
                      <th scope="col" className="px-5 py-3 font-medium">
                        <span className="sr-only">Photo</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pager.pageItems.map((log) => (
                      <tr key={log.id} className="align-top hover:bg-slate-50">
                        <td className="whitespace-nowrap px-5 py-3.5 font-medium text-slate-900">
                          {formatDayDate(logDateKey(log))}
                        </td>
                        <td className="tabular whitespace-nowrap px-3 py-3.5 text-slate-700">
                          {formatTime(log.time_in)}
                        </td>
                        <td className="tabular whitespace-nowrap px-3 py-3.5 text-slate-700">
                          {breakText(log)}
                        </td>
                        <td className="tabular whitespace-nowrap px-3 py-3.5 text-slate-700">
                          {formatTime(log.time_out)}
                        </td>
                        <td className="tabular whitespace-nowrap px-3 py-3.5 text-right font-medium text-slate-900">
                          {formatHours(log.hours)}
                        </td>
                        <td className="max-w-xs px-3 py-3.5">
                          <LogNotes log={log} inline />
                          <FixButton fix={fixFor(log)} />
                        </td>
                        <td className="px-3 py-3.5">
                          <StatusBadge status={log.status} />
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {log.image_url && <PhotoButton onClick={() => setPhotoLog(log)} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination state={pager} noun="log" />
            </>
          )}
        </Card>

        <Absences studentId={student?.student_id} />
      </div>

      <PhotoDialog log={photoLog} onClose={() => setPhotoLog(null)} />
      {resubmitting && (
        <ResubmitDialog
          log={resubmitting}
          attendance={attendance}
          onClose={() => setResubmitting(null)}
        />
      )}
      {closing && (
        <LateTimeOutDialog
          log={closing}
          attendance={attendance}
          onClose={() => setClosing(null)}
        />
      )}
    </StudentLayout>
  );
}

function breakText(log: AttendanceLog): string {
  if (!log.break_time) return "None";
  return `${formatTime(log.break_time)} – ${
    log.break_end_time ? formatTime(log.break_end_time) : "…"
  }`;
}

function FixButton({ fix }: { fix: { label: string; run: () => void } | null }) {
  if (!fix) return null;
  return (
    <button
      type="button"
      onClick={fix.run}
      className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg border border-psu-200 bg-psu-50 px-3 text-sm font-semibold text-psu-800 hover:bg-psu-100"
    >
      <Icon name="refresh" size={15} />
      {fix.label}
    </button>
  );
}

function PhotoButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-psu-700 hover:bg-psu-50"
    >
      <Icon name="image" size={15} />
      Photo
    </button>
  );
}

function LogNotes({ log, inline = false }: { log: AttendanceLog; inline?: boolean }) {
  const bySupervisor = log.capture_method === "supervisor";
  if (!log.note && !log.review_notes && !log.correction_note && !bySupervisor) {
    return inline ? <span className="text-slate-400">—</span> : null;
  }
  const rejected = log.status === "Rejected" || log.status === "Flagged";
  return (
    <div className={inline ? "space-y-1.5" : "mt-3 space-y-1.5"}>
      {bySupervisor && (
        <p className="flex items-center gap-1.5 text-sm text-slate-600">
          <Icon name="camera" size={14} className="shrink-0 text-slate-400" />
          Time-in recorded by your supervisor
        </p>
      )}
      {log.note && <p className="text-sm text-slate-600">{log.note}</p>}
      {log.correction_note && (
        <p className="rounded-md bg-psu-50 px-2.5 py-1.5 text-sm text-psu-900">
          <span className="font-semibold">You:</span> {log.correction_note}
        </p>
      )}
      {log.review_notes && (
        <p
          className={`rounded-md px-2.5 py-1.5 text-sm ${
            rejected ? "bg-red-50 text-red-800" : "bg-slate-100 text-slate-700"
          }`}
        >
          <span className="font-semibold">Supervisor:</span> {log.review_notes}
        </p>
      )}
    </div>
  );
}

/** Shows the photo submitted with a time-in. The file is private, so it is fetched with the student's token. */
function PhotoDialog({ log, onClose }: { log: AttendanceLog | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const imagePath = log?.image_url ?? null;

  useEffect(() => {
    if (!imagePath) return;
    let active = true;
    let objectUrl: string | null = null;
    getProtectedUploadUrl(imagePath, "student")
      .then((result) => {
        objectUrl = result;
        if (active) setUrl(result);
        else URL.revokeObjectURL(result);
      })
      .catch(() => {
        if (active) setError("This photo could not be loaded.");
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
      setError("");
    };
  }, [imagePath]);

  return (
    <Modal
      open={log !== null}
      onClose={onClose}
      title="Attendance photo"
      description={log ? `${formatLongDate(logDateKey(log))} · Time in ${formatTime(log.time_in)}` : undefined}
    >
      <div className="flex min-h-48 items-center justify-center rounded-xl bg-slate-100">
        {error ? (
          <p className="px-4 text-sm text-slate-600">{error}</p>
        ) : url ? (
          <img
            src={url}
            alt="Photo submitted at time-in"
            className="max-h-[60dvh] w-full rounded-xl object-contain"
          />
        ) : (
          <BrandLoader variant="inline" role="student" process="attendance" message="Loading your time-in photo…" />
        )}
      </div>
    </Modal>
  );
}
