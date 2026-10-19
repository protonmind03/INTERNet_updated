import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import EntryPictures from "./EntryPictures";
import Icon from "./Icon";
import type { PictureRole } from "../lib/attachments";
import { formatHours, formatLongDate, formatTime } from "../lib/format";
import { daysBetween } from "../lib/phTime";
import { patternWeek } from "../lib/schedulePattern";
import { dayStatus, type DayFacts, type DayStatus, type ShiftPattern } from "../lib/studentCalendar";
import { timeColumns } from "../lib/timeColumns";
import { useMediaQuery } from "../lib/useMediaQuery";

/*
|--------------------------------------------------------------------------
| ONE DAY, IN A SHEET
|--------------------------------------------------------------------------
|
| Iteration 21. What a tap on a calendar day opens: a bottom sheet on a
| phone (a handle; swipe down to close) and a popover on a wider screen,
| both over a blurred page, with the focus kept inside. Its heading is the
| day and its status; then the schedule, the four times (AM In, AM Out,
| PM In, PM Out) with early, late and sent-later marks, the hours, what else
| happened (a holiday, an absence, tasks worked, the time-out note), and the
| supervisor's decision with the way to appeal while there is time. Swipe
| sideways, or use the arrows, for the day before or after.
|
*/

const CHIP: Partial<Record<DayStatus, string>> = {
  Verified: "status-chip--success",
  Pending: "status-chip--warning",
  Late: "status-chip--late",
  Rejected: "status-chip--late",
  Absent: "status-chip--absent",
  "Morning absent": "status-chip--absent",
  Holiday: "status-chip--info",
};

const clock = (time: string | null | undefined) => {
  if (!time) return "";
  const [hours, minutes = "00"] = time.split(":");
  const hour = Number(hours);
  return `${hour % 12 || 12}:${minutes.slice(0, 2)} ${hour >= 12 ? "PM" : "AM"}`;
};

export default function DaySheet({
  facts,
  today,
  pattern,
  reader,
  pictureRole,
  onClose,
  onMove,
  footer,
}: {
  facts: DayFacts;
  today: string;
  pattern?: ShiftPattern | null;
  reader: "student" | "staff";
  pictureRole?: PictureRole;
  onClose: () => void;
  /** -1 for the day before, 1 for the day after. */
  onMove: (days: number) => void;
  footer?: ReactNode;
}) {
  const phone = useMediaQuery("(max-width: 639px)");
  const sheet = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const log = facts.log;
  const status = dayStatus(facts, today);
  const heading = formatLongDate(facts.date);

  // Focus in, Tab kept inside, Escape closes, focus back where it was.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    sheet.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab" && sheet.current) {
        const items = Array.from(sheet.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), [tabindex='0']"));
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === sheet.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (before && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, [onClose]);

  const columns = log ? timeColumns(log) : null;
  const sentLater = Boolean(log?.recorded_offline || log?.offline_time_in);
  const two = (pattern?.weeks ?? 1) === 2;
  const appealOpen =
    reader === "student" && log && !log.appeal && (log.status === "Rejected" || Boolean(log.time_correction_reason)) && daysBetween(facts.date, today) <= 7;

  const body = (
    <div
      ref={sheet}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`${heading}, ${status}`}
      className={phone ? "day-sheet day-sheet--bottom" : "day-sheet day-sheet--pop"}
      style={phone && drag > 0 ? { transform: `translateY(${drag}px)` } : undefined}
      onPointerDown={(event) => {
        start.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerMove={(event) => {
        if (!start.current || !phone) return;
        const down = event.clientY - start.current.y;
        if (down > 0 && Math.abs(down) > Math.abs(event.clientX - start.current.x)) setDrag(down);
      }}
      onPointerUp={(event) => {
        const from = start.current;
        start.current = null;
        setDrag(0);
        if (!from) return;
        const dx = event.clientX - from.x;
        const dy = event.clientY - from.y;
        if (phone && dy > 90 && Math.abs(dy) > Math.abs(dx)) onClose();
        else if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) onMove(dx < 0 ? 1 : -1);
      }}
      onPointerCancel={() => {
        start.current = null;
        setDrag(0);
      }}
    >
      {phone && <div aria-hidden="true" className="day-sheet-handle" />}
      <header className="flex items-start gap-2">
        <button type="button" aria-label="Day before" onClick={() => onMove(-1)} className="day-sheet-nav">
          <Icon name="chevron-right" size={18} className="rotate-180" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <h2 className="text-base font-semibold text-slate-900">{heading}</h2>
          <span className={`status-chip mt-1 ${CHIP[status] ?? "status-chip--absent"}`}>{status}</span>
        </div>
        <button type="button" aria-label="Day after" onClick={() => onMove(1)} className="day-sheet-nav">
          <Icon name="chevron-right" size={18} />
        </button>
        <button type="button" aria-label="Close" onClick={onClose} className="day-sheet-nav">
          <Icon name="close" size={18} />
        </button>
      </header>

      <div className="mt-3 max-h-[60dvh] space-y-4 overflow-y-auto pr-1">
        <section aria-label="Schedule" className="text-sm text-slate-700">
          {facts.holiday ? (
            <p>Holiday: {facts.holiday}</p>
          ) : facts.shift ? (
            <p>
              Shift {clock(facts.shift.start_time)} to {clock(facts.shift.end_time)}
              {facts.shift.lunch_start && facts.shift.lunch_end ? ` · lunch ${clock(facts.shift.lunch_start)} to ${clock(facts.shift.lunch_end)}` : ""}
              {two ? ` · Week ${patternWeek(pattern?.anchor ?? null, 2, facts.date)} of 2` : ""}
            </p>
          ) : (
            <p>Not on the schedule.</p>
          )}
        </section>

        {log && columns && (
          <section aria-label="Times">
            <dl className="grid grid-cols-2 gap-2">
              {([
                ["AM In", columns.amIn, log.late_minutes && log.late_minutes > 0 ? `Late by ${log.late_minutes} min` : log.credited_from && log.time_in && Date.parse(log.credited_from) > Date.parse(log.time_in) + 30_000 ? `Counts from ${clock(log.scheduled_start)}` : ""],
                ["AM Out", columns.noBreak ? null : columns.amOut, columns.noBreak ? "No break" : ""],
                ["PM In", columns.noBreak ? null : columns.pmIn, log.lunch_late_minutes && log.lunch_late_minutes > 0 ? `Back ${log.lunch_late_minutes} min late` : ""],
                ["PM Out", columns.pmOut, ""],
              ] as const).map(([label, value, note]) => (
                <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
                  <dt className="text-xs text-slate-600">{label}</dt>
                  <dd className="tabular text-base font-semibold text-slate-900">{value ? formatTime(value) : "–"}</dd>
                  {note && <dd className="text-xs font-medium text-slate-700">{note}</dd>}
                </div>
              ))}
            </dl>
            {sentLater && <p className="mt-1.5 text-xs text-slate-600">Some steps were sent later, from a phone with no connection.</p>}
          </section>
        )}

        <section aria-label="Hours" className="text-sm">
          {log ? (
            log.time_out ? (
              <p>
                <span className="font-semibold text-slate-900">{formatHours(log.hours)}</span> credited
                {log.status === "Pending" ? <span className="text-slate-600"> · Waiting for your supervisor</span> : null}
              </p>
            ) : (
              <p className="text-slate-700">Not timed out yet.</p>
            )
          ) : (
            <p className="text-slate-700">{facts.date > today ? "Not yet." : "No time-in recorded."}</p>
          )}
        </section>

        {(facts.absence || (log?.tasks && log.tasks.length > 0) || log?.accomplishments || facts.due.length > 0) && (
          <section aria-label="What else" className="space-y-2 text-sm text-slate-800">
            {facts.absence && (
              <p>
                {facts.absence.part === "am" ? "Morning absence" : facts.absence.part === "pm" ? "Afternoon absence" : "Absence"}:{" "}
                {facts.absence.status === "Pending" ? "waiting for a decision" : facts.absence.status.toLowerCase()}
                {facts.absence.reason ? ` · ${facts.absence.reason}` : ""}
              </p>
            )}
            {log?.tasks && log.tasks.length > 0 && <p>Tasks worked on: {log.tasks.map((task) => task.title).join("; ")}</p>}
            {log?.accomplishments && (
              <details>
                <summary className="cursor-pointer truncate">{log.accomplishments.split("\n")[0]}</summary>
                <p className="mt-1 whitespace-pre-line break-words">{log.accomplishments}</p>
              </details>
            )}
            {facts.due.length > 0 && <p>Due: {facts.due.map((task) => task.title).join("; ")}</p>}
            {pictureRole && log?.id && log.id > 0 ? <EntryPictures role={pictureRole} owner="attendance" ownerId={log.id} count={log.pictures} className="" /> : null}
          </section>
        )}

        {log && (log.review_notes || log.time_correction_reason || log.photo_rejection_reason || log.status !== "Pending") && (
          <section aria-label="Decision" data-focus="day-decision" className="rounded-lg border border-slate-200 p-3 text-sm">
            <p className="font-semibold text-slate-900">
              {log.status === "Verified" ? "Verified" : log.status === "Rejected" || log.status === "Flagged" ? "Rejected" : "Waiting for a decision"}
            </p>
            {log.photo_rejection_reason && <p className="mt-1 text-slate-700">Photo: {log.photo_rejection_reason}</p>}
            {log.review_notes && <p className="mt-1 text-slate-700">{log.review_notes}</p>}
            {log.time_correction_reason && <p className="mt-1 text-slate-700">Times corrected: {log.time_correction_reason}</p>}
            {log.appeal && <p className="mt-1 text-slate-700">Appeal: {log.appeal.status}{log.appeal.decision_note ? ` · ${log.appeal.decision_note}` : ""}</p>}
            {appealOpen && (
              <Link to={`/daily-log?focus=attendance-${log.id}`} className="mt-2 inline-flex min-h-11 items-center font-semibold text-psu-700 underline">
                Appeal this decision
              </Link>
            )}
          </section>
        )}

        {footer}
      </div>
    </div>
  );

  return createPortal(
    <div className="modal-backdrop fixed inset-0 z-(--z-modal) flex items-end justify-center sm:items-center sm:p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      {body}
    </div>,
    document.body
  );
}
