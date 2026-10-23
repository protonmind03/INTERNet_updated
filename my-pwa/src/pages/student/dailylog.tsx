import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import DateRangeFilter from "../../components/DateRangeFilter";
import EntryPictures from "../../components/EntryPictures";
import Icon from "../../components/Icon";
import Pagination from "../../components/Pagination";
import { Button, Card, EmptyState, ErrorNotice, FilterChips, Modal, SkeletonRows, StatusBadge } from "../../components/ui";
import { BrandLoader } from "../../brand";
import StudentLayout from "../../layouts/StudentLayout";
import { getProtectedUploadUrl } from "../../lib/api";
import { isWithinDateRange } from "../../lib/dateRange";
import { formatDayDate, formatDuration, formatHours, formatLongDate, formatTime, phDateKey } from "../../lib/format";
import { formatPhDay, phAddDays, phToday } from "../../lib/phTime";
import { useAccount } from "../../lib/session";
import { focusId, recordId, useFocus, useFocusRecord } from "../../lib/useFocusRecord";
import { usePagination } from "../../lib/usePagination";
import Absences from "./Absences";
import { AppealActions } from "./Appeals";
import { appealableKinds } from "./appealRules";
import { LateTimeOutDialog, MissedTimeOutNotice, ResubmitDialog } from "./AttendanceCorrections";
import TimeInProvider from "./TimeInProvider";
import { useTimeIn } from "./timeInContext";
import { logDateKey, workedMinutes, type AttendanceLog } from "./useAttendance";
import { sameId } from "../../lib/ids";

/*
|--------------------------------------------------------------------------
| ATTENDANCE (PSU redesign, 7A2)
|--------------------------------------------------------------------------
|
| Time record and Report absence first; this week as bars; then the days,
| filtered All, To fix, Pending or Verified. Each day is one row: the date
| as a stamp, its hours and times, and on the right either its status (a
| word with a mark, never colour alone) or what can be done about it.
| Retake is a solid amber button with a camera; Appeal is outlined: they
| never look alike. A rejected day's note, the supervisor's correction and
| an appeal's answer sit under the row.
|
*/

type Filter = "All" | "Fix" | "Pending" | "Verified";

/** Something the trainee can do about this day. */
function needsFixing(log: AttendanceLog, today: string): boolean {
  if (!log.time_out && log.time_in && logDateKey(log) < today) return true;
  if (log.photo_redo_status === "required" && !log.time_out) return true;
  if (log.status === "Rejected" || log.status === "Flagged") return true;
  return appealableKinds(log).length > 0;
}

function matchesFilter(log: AttendanceLog, filter: Filter, today: string): boolean {
  if (filter === "All") return true;
  if (filter === "Fix") return needsFixing(log, today);
  return log.status === filter;
}

/** Mounts the shared time-in actions above the page, which reads the attendance before it renders the layout. */
export default function DailyLog() {
  return (
    <TimeInProvider>
      <DailyLogPage />
    </TimeInProvider>
  );
}

function DailyLogPage() {
  const student = useAccount("student");
  const { attendance, now, online } = useTimeIn();
  const { logs, loading } = attendance;
  const [params, setParams] = useSearchParams();

  const [filter, setFilter] = useState<Filter>(params.get("filter") === "fix" ? "Fix" : "All");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [photoLog, setPhotoLog] = useState<AttendanceLog | null>(null);
  const [resubmitting, setResubmitting] = useState<AttendanceLog | null>(null);
  const [closing, setClosing] = useState<AttendanceLog | null>(null);

  const today = phDateKey(new Date());

  const counts = useMemo(
    () => ({
      All: logs.length,
      Fix: logs.filter((log) => matchesFilter(log, "Fix", today)).length,
      Pending: logs.filter((log) => log.status === "Pending").length,
      Verified: logs.filter((log) => log.status === "Verified").length,
    }),
    [logs, today]
  );

  const visibleLogs = useMemo(() => {
    const text = search.trim().toLowerCase();
    return logs.filter((log) => {
      if (!matchesFilter(log, filter, today)) return false;
      const key = logDateKey(log);
      if (!isWithinDateRange(key, dateFrom, dateTo)) return false;
      if (!text) return true;
      return [key, formatDayDate(key), log.note, log.review_notes, log.status].filter(Boolean).some((value) => String(value).toLowerCase().includes(text));
    });
  }, [logs, filter, search, dateFrom, dateTo, today]);
  const filtered = filter !== "All" || search.trim() !== "" || dateFrom !== "" || dateTo !== "";
  const pager = usePagination(visibleLogs, 15);

  // A notification about one log: turn to the page it is on, then outline it.
  const focusedLog = focusId(useFocus(), "attendance");
  const focusedAt = focusedLog ? visibleLogs.findIndex((log) => sameId(log.id, focusedLog)) : -1;
  const turnTo = pager.setPage;
  const [turned, setTurned] = useState(false);
  useEffect(() => {
    if (focusedAt < 0 || turned) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      turnTo(Math.floor(focusedAt / 15) + 1);
      setTurned(true);
    });
    return () => {
      active = false;
    };
  }, [focusedAt, turned, turnTo]);
  useFocusRecord(turned);

  const pickFilter = (next: Filter) => {
    setFilter(next);
    if (params.get("filter")) {
      const copy = new URLSearchParams(params);
      copy.delete("filter");
      setParams(copy, { replace: true });
    }
  };
  const clearFilters = () => {
    pickFilter("All");
    setSearch("");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <StudentLayout title="Attendance">
      <div className="space-y-4">
        {attendance.error && <ErrorNotice message={attendance.error} onRetry={() => void attendance.reload()} />}

        <div className="grid grid-cols-2 gap-2.5">
          <Link to="/time-record" className="card-hairline flex min-h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-bold text-psu-700 hover:bg-psu-50">
            <Icon name="printer" size={18} />
            Time record
          </Link>
          <a href="#absences" className="card-hairline flex min-h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-bold text-psu-700 hover:bg-psu-50">
            <Icon name="calendar" size={18} />
            Report absence
          </a>
        </div>

        <MissedTimeOutNotice attendance={attendance} />

        <WeekBars logs={logs} now={now} loading={loading} />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <FilterChips
            label="Show"
            value={filter}
            onChange={pickFilter}
            options={[
              { value: "All", label: "All" },
              { value: "Fix", label: "To fix", count: counts.Fix || undefined },
              { value: "Pending", label: "Pending" },
              { value: "Verified", label: "Verified" },
            ]}
          />
          <button type="button" onClick={() => setShowFilters((value) => !value)} aria-expanded={showFilters} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-slate-600 hover:bg-white">
            <Icon name="search" size={16} />
            Search
          </button>
        </div>
        {showFilters && (
          <div className="card-hairline space-y-3 rounded-xl p-3">
            <label className="relative block">
              <span className="sr-only">Search attendance</span>
              <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search notes or dates" className="field pl-9" />
            </label>
            <DateRangeFilter
              from={dateFrom}
              to={dateTo}
              onChange={(from, to) => {
                setDateFrom(from);
                setDateTo(to);
              }}
            />
          </div>
        )}

        <Card>
          {loading ? (
            <SkeletonRows rows={5} />
          ) : visibleLogs.length === 0 ? (
            filtered ? (
              <EmptyState
                icon="search"
                title={filter === "Fix" ? "Nothing to fix" : "No days match"}
                action={
                  <button type="button" onClick={clearFilters} className="min-h-11 text-sm font-semibold text-psu-700 hover:underline">
                    Show every day
                  </button>
                }
              />
            ) : (
              <EmptyState icon="clock" title="No attendance yet" description="Your days appear here once you time in." />
            )
          ) : (
            <>
              <ul className="divide-y divide-(--role-hairline)">
                {pager.pageItems.map((log) => (
                  <li key={log.id} id={recordId("attendance", log.id)} className="px-3.5 py-3.5 sm:px-4">
                    <DayRow
                      log={log}
                      now={now}
                      today={today}
                      online={online}
                      onRetake={() => {
                        const banner = document.querySelector<HTMLButtonElement>('[data-focus="retake-photo"]');
                        if (banner) {
                          banner.scrollIntoView({ block: "center" });
                          banner.click();
                        }
                      }}
                      onClose={() => setClosing(log)}
                      onResubmit={() => setResubmitting(log)}
                      onPhoto={() => setPhotoLog(log)}
                      onChanged={() => void attendance.reload()}
                    />
                  </li>
                ))}
              </ul>
              <Pagination state={pager} noun="day" />
            </>
          )}
        </Card>

        <div id="absences" className="scroll-mt-24">
          <Absences studentId={student?.student_id} />
        </div>
      </div>

      <PhotoDialog log={photoLog} onClose={() => setPhotoLog(null)} />
      {resubmitting && <ResubmitDialog log={resubmitting} attendance={attendance} onClose={() => setResubmitting(null)} />}
      {closing && <LateTimeOutDialog log={closing} attendance={attendance} onClose={() => setClosing(null)} />}
    </StudentLayout>
  );
}

/* ---------- This week, as bars ---------- */

function WeekBars({ logs, now, loading }: { logs: AttendanceLog[]; now: Date; loading: boolean }) {
  const today = phToday();
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = phAddDays(today, -((weekday + 6) % 7));
  const days = Array.from({ length: 5 }, (_, index) => {
    const key = phAddDays(monday, index);
    const log = logs.find((item) => logDateKey(item) === key);
    const working = Boolean(log?.time_in && !log.time_out && key === today);
    const minutes = log ? (working ? workedMinutes(log, now) : (Number(log.hours) || 0) * 60) : 0;
    return { key, minutes, working, logged: Boolean(log?.time_in), label: formatPhDay(key, { weekday: "short" }) };
  });
  const total = days.reduce((sum, day) => sum + day.minutes, 0);
  const logged = days.filter((day) => day.logged).length;
  const scale = Math.max(8 * 60, ...days.map((day) => day.minutes));
  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[16px] font-bold text-slate-900">This week</h2>
        <p className="tabular text-[13.5px] text-slate-600">
          {formatDuration(total)} · {logged} of 5 days
        </p>
      </div>
      {loading ? (
        <SkeletonRows rows={1} />
      ) : (
        <div className="mt-3 grid grid-cols-5 gap-2" role="list" aria-label="Hours each day this week">
          {days.map((day) => (
            <div key={day.key} role="listitem" className="flex flex-col items-center gap-1.5" aria-label={`${day.label}: ${day.minutes > 0 ? formatDuration(day.minutes) : "no hours"}${day.working ? ", working now" : ""}`}>
              <div className="flex h-16 w-full items-end" aria-hidden="true">
                <div
                  className={`w-full rounded-md ${day.working ? "bg-psu-600" : day.minutes > 0 ? "bg-psu-100" : "h-1 bg-slate-200"}`}
                  style={day.minutes > 0 ? { height: `${Math.max(10, Math.round((day.minutes / scale) * 64))}px` } : undefined}
                />
              </div>
              <span className={`text-[12.5px] ${day.key === today ? "font-bold text-slate-900" : "text-slate-600"}`}>{day.label}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------- One day ---------- */

function DayRow({
  log,
  now,
  today,
  online,
  onRetake,
  onClose,
  onResubmit,
  onPhoto,
  onChanged,
}: {
  log: AttendanceLog;
  now: Date;
  today: string;
  online: boolean;
  onRetake: () => void;
  onClose: () => void;
  onResubmit: () => void;
  onPhoto: () => void;
  onChanged: () => void;
}) {
  const key = logDateKey(log);
  const working = Boolean(log.time_in && !log.time_out && key === today);
  const missedOut = Boolean(log.time_in && !log.time_out && key < today);
  const rejected = log.status === "Rejected" || log.status === "Flagged";
  const retake = log.photo_redo_status === "required" && !log.time_out;
  const lunch = log.break_time
    ? ` · lunch ${log.break_end_time ? formatDuration((Date.parse(log.break_end_time) - Date.parse(log.break_time)) / 60_000) : "now"}`
    : "";

  let title: string;
  let line: string;
  let lineBad = false;
  if (working) {
    title = "Working now";
    line = retake ? `Photo rejected · retake ${log.photo_redo_due_at ? `by ${formatTime(log.photo_redo_due_at)}` : "before End break"}` : `In at ${formatTime(log.time_in)} · ${formatDuration(workedMinutes(log, now))}`;
    lineBad = retake;
  } else if (rejected) {
    title = "Day rejected";
    line = log.review_notes ? `“${log.review_notes}”` : "Your supervisor rejected this day";
    lineBad = true;
  } else if (missedOut) {
    title = "No time-out";
    line = `In at ${formatTime(log.time_in)} · enter the time you left`;
    lineBad = true;
  } else {
    title = formatHours(log.hours);
    line = `${formatTime(log.time_in)} – ${formatTime(log.time_out)}${lunch}`;
  }

  return (
    <div>
      <div className="flex items-start gap-3">
        <span className="w-11 shrink-0 text-center leading-none" aria-hidden="true">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">{formatPhDay(key, { weekday: "short" })}</span>
          <span className="font-display tabular mt-0.5 block text-[22px] font-extrabold text-slate-900">{formatPhDay(key, { day: "numeric" })}</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="tabular text-[15.5px] font-bold text-slate-900">
            <span className="sr-only">{formatDayDate(key)}: </span>
            {title}
          </p>
          <p className={`tabular mt-0.5 text-[13.5px] ${lineBad ? "text-(--status-late-ink)" : "text-slate-600"}`}>{line}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {retake && working ? (
            <>
              <Button icon="camera" onClick={onRetake} disabled={!online}>
                Retake now
              </Button>
              <AppealActions log={log} onChanged={onChanged} />
            </>
          ) : missedOut ? (
            <Button variant="outline" onClick={onClose} data-focus="time-out">
              Enter time-out
            </Button>
          ) : (
            <>
              {!working && <StatusBadge status={log.status === "Flagged" ? "Rejected" : log.status} />}
              <AppealActions log={log} onChanged={onChanged} />
            </>
          )}
        </div>
      </div>
      <DayNotes log={log} onResubmit={onResubmit} onPhoto={onPhoto} />
    </div>
  );
}

function DayNotes({ log, onResubmit, onPhoto }: { log: AttendanceLog; onResubmit: () => void; onPhoto: () => void }) {
  const bySupervisor = log.capture_method === "supervisor";
  const notes: React.ReactNode[] = [];
  if (bySupervisor) notes.push(<span key="by">Time-in recorded by your supervisor.</span>);
  if (log.offline_time_in)
    notes.push(
      <span key="offline">
        {log.waiting?.includes("time-in") ? "Recorded with no connection: waiting to be sent." : "Recorded with no connection, so there is no photo."}
      </span>
    );
  if (log.note) notes.push(<span key="note">{log.note}</span>);
  if (log.correction_note) notes.push(<span key="you"><b>You:</b> {log.correction_note}</span>);
  if (log.time_correction_reason) notes.push(<span key="corrected"><b>Times corrected by your supervisor:</b> {log.time_correction_reason}</span>);
  if (log.photo_rejection_reason && log.photo_redo_status !== "required") {
    notes.push(
      <span key="photo">
        <b>Photo rejected:</b> {log.photo_rejection_reason} {log.photo_redo_status === "submitted" ? "You took a new one." : log.photo_redo_status === "missed" ? "No new photo was taken in time." : ""}
      </span>
    );
  }
  if (log.appeal && log.appeal.status !== "withdrawn") {
    notes.push(
      <span key="appeal">
        <b>{log.appeal.status === "open" ? "Appeal waiting for the coordinator." : log.appeal.status === "overturned" ? "Appeal accepted." : "Appeal not accepted."}</b>
        {log.appeal.decision_note ? ` ${log.appeal.decision_note}` : ""}
      </span>
    );
  }
  const resubmit = log.status === "Rejected" && !log.appeal;
  if (notes.length === 0 && !log.image_url && !(log.pictures ?? 0) && !resubmit) return null;
  return (
    <div className="ml-14 mt-2 space-y-1.5 text-[13.5px] text-slate-700">
      {notes.map((note, index) => (
        <p key={index}>{note}</p>
      ))}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {log.image_url && (
          <button type="button" onClick={onPhoto} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-psu-700 hover:underline">
            <Icon name="image" size={15} />
            Photo
          </button>
        )}
        {resubmit && (
          <button type="button" onClick={onResubmit} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-psu-700 hover:underline">
            <Icon name="refresh" size={15} />
            Ask for another review
          </button>
        )}
      </div>
      {log.id > 0 && <EntryPictures role="student" owner="attendance" ownerId={log.id} count={log.pictures ?? 0} />}
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
    <Modal open={log !== null} onClose={onClose} title="Attendance photo" description={log ? `${formatLongDate(logDateKey(log))} · Time in ${formatTime(log.time_in)}` : undefined}>
      <div className="flex min-h-48 items-center justify-center rounded-xl bg-slate-100">
        {error ? (
          <p className="px-4 text-sm text-slate-600">{error}</p>
        ) : url ? (
          <img src={url} alt="Photo submitted at time-in" className="max-h-[60dvh] w-full rounded-xl object-contain" />
        ) : (
          <BrandLoader variant="inline" role="student" process="attendance" message="Loading your time-in photo…" />
        )}
      </div>
    </Modal>
  );
}
