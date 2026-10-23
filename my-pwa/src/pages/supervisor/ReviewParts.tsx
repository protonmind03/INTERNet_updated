import { useState } from "react";
import { Link } from "react-router-dom";
import { Register, Stamp } from "../../brand/motifs";
import Icon, { type IconName } from "../../components/Icon";
import InfoTip from "../../components/InfoTip";
import { Button, Card, Skeleton } from "../../components/ui";
import { formatDayDate, formatHours, formatTime, getInitials } from "../../lib/format";
import { formatPhDay, phAddDays, phToday } from "../../lib/phTime";
import type { Projection } from "../../lib/useProjections";
import { sameId } from "../../lib/ids";
import type { FinalDue } from "./finalDue";
import type { AttendanceEntry, Intern, QueueItem, SupervisorWork } from "./useSupervisorWork";

/*
|--------------------------------------------------------------------------
| THE SUPERVISOR'S REVIEW, PIECE BY PIECE (PSU redesign 10, S1, S6, S7)
|--------------------------------------------------------------------------
|
| The logbook: today's register (or, on a computer, the day board), one card
| per decision with a solid main action and an outlined choice, a grey
| "Verified" stamp on what was decided today, this week's dates and plain
| fact cards. Decisions go through the same calls as before
| (useSupervisorWork): the version check, the undo and the rules for what
| "Verify all" may include are unchanged.
|
*/

export type ReviewItem = QueueItem | FinalDue;

/** Minutes since midnight, Philippine time. */
function phMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Manila" }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return (hour % 24) * 60 + minute;
}

function findLog(logs: Map<string, AttendanceEntry>, studentId: string): AttendanceEntry | undefined {
  for (const [id, entry] of logs) if (sameId(id, studentId)) return entry;
  return undefined;
}

/* ---------- Today's register (phones and tablets) ---------- */

export function RegisterCard({ interns, logs }: { interns: Intern[]; logs: Map<string, AttendanceEntry> }) {
  const entries = interns.map((intern) => {
    const log = findLog(logs, intern.student_id);
    return { key: intern.student_id, initials: getInitials(intern.name, "IN"), name: intern.name, time: log ? formatTime(log.time_in).replace(/\s?[AP]M$/i, "") : null };
  });
  const inCount = entries.filter((entry) => entry.time).length;
  const missing = entries.filter((entry) => !entry.time);
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-3.5">
        <h2 className="eyebrow text-(--role-ink)/80">Today&rsquo;s register</h2>
        <p className="tabular text-[13.5px] text-slate-700">
          <b className="text-slate-900">{inCount}</b> of {entries.length} in
        </p>
      </div>
      {entries.length > 0 && (
        <div className="border-t border-(--role-hairline)">
          <Register entries={entries} />
        </div>
      )}
      {missing.length > 0 && missing.length < entries.length && (
        <p className="border-t border-(--role-hairline) px-4 py-2 text-[13px] text-slate-600">
          {missing.length === 1 ? `${missing[0].name} isn't in yet` : `${missing.length} aren't in yet`}
        </p>
      )}
    </Card>
  );
}

/** The register's frame while the interns load, so the queue below does not jump when it fills in. */
export function RegisterSkeleton() {
  return (
    <Card aria-busy="true">
      <div className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-3.5">
        <h2 className="eyebrow text-(--role-ink)/80">Today&rsquo;s register</h2>
        <Skeleton className="h-[18px] w-16" />
      </div>
      <div className="border-t border-(--role-hairline) px-4 py-3">
        <Skeleton className="h-[38px] w-full" />
      </div>
      <div className="border-t border-(--role-hairline) px-4 py-2">
        <Skeleton className="h-[19px] w-28" />
      </div>
    </Card>
  );
}

/* ---------- The day board (computers): one row per intern on an 8 AM to 5 PM line ---------- */

const START = 8 * 60;
const END = 17 * 60;
const pct = (minutes: number) => `${((Math.min(END, Math.max(START, minutes)) - START) / (END - START)) * 100}%`;

function statusOf(log: AttendanceEntry | undefined): { text: string; tone: "info" | "bad" | "neutral" } {
  if (!log) return { text: "Not in yet", tone: "bad" };
  if (log.time_out) return { text: `Out · ${formatTime(log.time_out).replace(/\s?[AP]M$/i, "")}`, tone: "neutral" };
  if (log.break_time && !log.break_end_time) return { text: "At lunch", tone: "info" };
  return { text: `In · ${formatTime(log.time_in).replace(/\s?[AP]M$/i, "")}`, tone: "neutral" };
}

/** Rows the day board shows before "Show all", so the queue below stays in view. */
const BOARD_ROWS = 6;

export function DayBoard({ company, interns, logs, now }: { company: string; interns: Intern[]; logs: Map<string, AttendanceEntry>; now: Date }) {
  const [all, setAll] = useState(false);
  const shown = all ? interns : interns.slice(0, BOARD_ROWS);
  const nowMinutes = phMinutes(now.toISOString()) ?? START;
  const showNow = nowMinutes > START && nowMinutes < END;
  const inCount = interns.filter((intern) => findLog(logs, intern.student_id)).length;
  return (
    <section className="card-hairline overflow-hidden rounded-2xl" aria-labelledby="day-board-title">
      <div className="flex items-center gap-3 bg-(--role-chrome) px-5 py-3 text-white ruled-header">
        <h2 id="day-board-title" className="font-display text-[19px] font-extrabold">
          Today at {company}
        </h2>
        <span className="text-[13.5px] text-white/85">
          {inCount} of {interns.length} interns in
        </span>
        <span className="ml-auto text-white">
          <InfoTip label="About the day board" text="Each bar is a day's work from time-in; the hatched part is lunch. The line marks now." className="text-white/80" />
        </span>
      </div>
      <div className="px-5 pb-4 pt-3">
        <div className="relative ml-[11.5rem] mr-[7rem] h-9 text-[11.5px] text-slate-500" aria-hidden="true">
          {[8, 10, 12, 14, 16, 17].map((hour) => (
            <span key={hour} className="absolute -translate-x-1/2" style={{ left: pct(hour * 60) }}>
              {hour === 12 ? "12 PM" : hour > 12 ? `${hour - 12}${hour === 17 ? " PM" : ""}` : `${hour}${hour === 8 ? " AM" : ""}`}
            </span>
          ))}
          {showNow && (
            <span className="absolute top-[18px] -translate-x-1/2 text-[10.5px] font-bold text-slate-900" style={{ left: pct(nowMinutes) }}>
              now
            </span>
          )}
        </div>
        <ul className="mt-1 space-y-1.5" aria-label="Your interns today">
          {shown.map((intern) => {
            const log = findLog(logs, intern.student_id);
            const status = statusOf(log);
            const inAt = phMinutes(log?.time_in);
            const lunchAt = phMinutes(log?.break_time);
            const backAt = phMinutes(log?.break_end_time);
            const outAt = phMinutes(log?.time_out) ?? nowMinutes;
            const segments: Array<{ from: number; to: number; lunch?: boolean }> = [];
            if (inAt !== null) {
              if (lunchAt !== null) {
                segments.push({ from: inAt, to: lunchAt });
                segments.push({ from: lunchAt, to: backAt ?? outAt, lunch: true });
                if (backAt !== null) segments.push({ from: backAt, to: outAt });
              } else {
                segments.push({ from: inAt, to: outAt });
              }
            }
            return (
              <li key={intern.student_id} className="grid grid-cols-[11rem_minmax(0,1fr)_6.5rem] items-center gap-3">
                <Link to={`/supervisor/interns/${encodeURIComponent(intern.student_id)}`} className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg hover:underline">
                  <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-psu-50 text-[10.5px] font-bold text-psu-800">
                    {getInitials(intern.name, "IN")}
                  </span>
                  <span className="truncate text-[14px] font-semibold text-slate-900">{intern.name}</span>
                </Link>
                <div className="relative h-3 rounded-full bg-slate-100" role="img" aria-label={`${intern.name}: ${status.text}`}>
                  {segments.map((segment, index) => (
                    <span
                      key={index}
                      className={`absolute inset-y-0 rounded-full ${segment.lunch ? "pattern-hatch-role" : "bg-psu-600"}`}
                      style={{ left: pct(segment.from), width: `calc(${pct(segment.to)} - ${pct(segment.from)})` }}
                    />
                  ))}
                  {showNow && <span aria-hidden="true" className="absolute -inset-y-1.5 w-0.5 bg-slate-900" style={{ left: pct(nowMinutes) }} />}
                </div>
                <span className={`st-badge justify-self-end ${status.tone === "bad" ? "st-badge--bad" : status.tone === "info" ? "st-badge--info" : "st-badge--neutral"}`}>
                  {status.text}
                </span>
              </li>
            );
          })}
        </ul>
        {interns.length > BOARD_ROWS && (
          <button
            type="button"
            onClick={() => setAll((value) => !value)}
            aria-expanded={all}
            className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-psu-700 hover:underline"
          >
            {all ? "Show fewer" : `Show all ${interns.length} interns`}
          </button>
        )}
      </div>
    </section>
  );
}

/* ---------- One decision ---------- */

const KIND_LABEL: Record<ReviewItem["kind"], string> = {
  attendance: "Time-in",
  task: "Task",
  document: "Document",
  absence: "Absence",
  journal: "Weekly report",
  final: "Final evaluation",
};

const KIND_ICON: Record<ReviewItem["kind"], IconName> = {
  attendance: "camera",
  task: "tasks",
  document: "document",
  absence: "calendar",
  journal: "note",
  final: "star",
};

function attendanceChips(entry: AttendanceEntry): Array<{ text: string; tone: "info" | "neutral" | "bad" }> {
  const chips: Array<{ text: string; tone: "info" | "neutral" | "bad" }> = [];
  if (entry.offline_time_in) {
    if (!entry.image_url) chips.push({ text: "No photo", tone: "info" });
    const skew = entry.clock_skew_seconds;
    if (skew !== null && skew !== undefined) {
      chips.push(Math.abs(skew) <= 120 ? { text: "Phone clock OK", tone: "neutral" } : { text: `Phone clock off ${Math.round(Math.abs(skew) / 60)} min`, tone: "bad" });
    }
  } else if (entry.capture_method === "liveness") {
    chips.push({ text: entry.liveness_checks?.level === "strict" ? "✓ Strict camera check" : "✓ Camera check", tone: "neutral" });
  } else if (entry.capture_method === "supervisor") {
    chips.push({ text: "Recorded by you", tone: "neutral" });
  }
  if (entry.photo_redo_status === "required") chips.push({ text: "Retake asked", tone: "info" });
  return chips;
}

function lateText(entry: AttendanceEntry): string {
  if (entry.late_minutes === null || entry.late_minutes === undefined) return "";
  return entry.late_minutes > 0 ? ` · ${entry.late_minutes} min late` : " · on time";
}

export function DecisionCard({
  item,
  layout,
  busy,
  onVerify,
  onOpen,
  onRejectChoice,
}: {
  item: QueueItem;
  layout: "card" | "row";
  busy: boolean;
  /** The solid main action for an ordinary time-in, or "Confirm on its own" for an offline one. */
  onVerify: () => void;
  /** Opens the full decision (the outlined choice, Review, Return). */
  onOpen: () => void;
  /** "Reject: photo or day" from one menu; both open the decision with its reason box. */
  onRejectChoice: (which: "photo" | "day") => void;
}) {
  const [menu, setMenu] = useState(false);
  const attendance = item.kind === "attendance" ? item.entry : null;
  const open = attendance ? !attendance.time_out : false;
  const offline = Boolean(attendance?.offline_time_in);
  const photoRejectable = Boolean(attendance && open && attendance.image_url && String(attendance.date).slice(0, 10) === phToday() && attendance.photo_redo_status !== "required");

  let eyebrow = KIND_LABEL[item.kind];
  let line = "";
  if (attendance) {
    eyebrow = `Time-in${offline ? " · recorded offline" : ""}`;
    line = `${formatTime(attendance.time_in)}${lateText(attendance)}${open ? " · still on the clock" : attendance.hours ? ` · ${formatHours(attendance.hours)}` : ""}`;
  } else if (item.kind === "task") {
    line = item.entry.title;
  } else if (item.kind === "document") {
    line = item.entry.doc_type;
  } else if (item.kind === "absence") {
    line = formatDayDate(item.entry.date);
  } else if (item.kind === "journal") {
    line = `Week of ${formatDayDate(item.entry.week_start)}`;
  }
  const chips = attendance ? attendanceChips(attendance) : [];
  // Each button says which item it acts on, so a screen reader hears more than "Review" again and again.
  const what = `${KIND_LABEL[item.kind]}${line ? ` · ${line}` : ""}, ${item.entry.student_name}`;

  const actions = attendance ? (
    <>
      <span className="relative">
        <Button variant="outline" onClick={() => setMenu((value) => !value)} aria-haspopup="menu" aria-expanded={menu} disabled={busy}>
          Reject
          <Icon name="chevron-down" size={15} />
        </Button>
        {menu && (
          <span role="menu" className="absolute right-0 top-full z-10 mt-1 w-52 overflow-hidden rounded-xl border border-(--role-hairline) bg-white py-1 shadow-raised">
            {photoRejectable && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  onRejectChoice("photo");
                }}
                className="flex min-h-11 w-full items-center px-3.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                Reject the photo
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                onRejectChoice("day");
              }}
              className="flex min-h-11 w-full items-center px-3.5 text-left text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Reject the day
            </button>
          </span>
        )}
      </span>
      {open ? (
        <Button variant="secondary" onClick={onOpen} disabled={busy} aria-label={`Review ${what}`}>
          Review
        </Button>
      ) : (
        <Button onClick={onVerify} busy={busy} busyProcess="verify" aria-label={`${offline ? "Confirm on its own" : "Verify"} ${what}`}>
          {offline ? "Confirm on its own" : "Verify"}
        </Button>
      )}
    </>
  ) : (
    <>
      {item.kind !== "absence" && (
        <Button variant="outline" onClick={onOpen} aria-label={`Return ${what}`}>
          Return
        </Button>
      )}
      <Button onClick={onOpen} aria-label={`Review ${what}`}>
        Review
      </Button>
    </>
  );

  if (layout === "row") {
    return (
      <div className="grid grid-cols-[2.5rem_6.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
        <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-lg bg-psu-50 text-psu-700">
          <Icon name={offline ? "clock" : KIND_ICON[item.kind]} size={18} />
        </span>
        <span className="eyebrow text-slate-600">{KIND_LABEL[item.kind]}</span>
        <span className="min-w-0">
          <span className="block truncate text-[14.5px] font-bold text-slate-900">{item.entry.student_name}</span>
          <span className="block truncate text-[13px] text-slate-600">
            {line}
            {offline ? " · recorded offline" : ""}
          </span>
        </span>
        <span className="flex flex-wrap items-center justify-end gap-2">
          {chips.map((chip) => (
            <span key={chip.text} className={`st-badge st-badge--${chip.tone === "bad" ? "bad" : chip.tone === "info" ? "info" : "neutral"}`}>
              {chip.text}
            </span>
          ))}
          {actions}
        </span>
      </div>
    );
  }

  return (
    <article className="card-hairline rounded-2xl p-3.5" aria-label={`${KIND_LABEL[item.kind]}: ${item.entry.student_name}`}>
      <div className="flex gap-3">
        <span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
          <Icon name={offline ? "clock" : KIND_ICON[item.kind]} size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow text-slate-600">{eyebrow}</p>
          <p className="truncate text-[16px] font-bold text-slate-900">{item.entry.student_name}</p>
          {line && <p className="tabular truncate text-[13.5px] text-slate-600">{line}</p>}
          {chips.length > 0 && (
            <p className="mt-1.5 flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <span key={chip.text} className={`st-badge st-badge--${chip.tone === "bad" ? "bad" : chip.tone === "info" ? "info" : "neutral"}`}>
                  {chip.text}
                </span>
              ))}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-2.5 [&>*]:w-full [&_button]:w-full">{actions}</div>
    </article>
  );
}

/** What was decided today, with the grey rubber stamp. */
export function DecidedRow({ entry }: { entry: AttendanceEntry }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <p className="min-w-0 truncate text-[14.5px]">
        <b className="text-slate-900">{entry.student_name}</b>
        <span className="text-slate-600"> · time-in {formatTime(entry.time_in)}</span>
      </p>
      {entry.status === "Verified" ? <Stamp tone="grey">Verified</Stamp> : <Stamp tone="bad">Rejected</Stamp>}
    </div>
  );
}

/* ---------- This week (computers) ---------- */

type WeekRow = { date: string; title: string; line: string; to: string };

export function ThisWeek({ work, finalDue, projections }: { work: SupervisorWork; finalDue: FinalDue[]; projections: Map<string, Projection> }) {
  const today = phToday();
  const end = phAddDays(today, 7);
  const rows: WeekRow[] = [];
  for (const intern of work.interns) {
    let projection: Projection | undefined;
    for (const [id, value] of projections) if (sameId(id, intern.student_id)) projection = value;
    const finish = projection?.projected_finish;
    if (finish && finish >= today && finish <= end) {
      rows.push({ date: finish, title: `${intern.name.split(/\s+/)[0]}'s final evaluation`, line: `Reaches ${formatHours(intern.required_hours)}`, to: "/supervisor/evaluation" });
    }
  }
  for (const due of finalDue) {
    if (!rows.some((row) => row.title.startsWith(due.entry.student_name.split(/\s+/)[0]))) {
      rows.push({ date: today, title: `${due.entry.student_name.split(/\s+/)[0]}'s final evaluation`, line: "Due now", to: "/supervisor/evaluation" });
    }
  }
  const dueByDay = new Map<string, string[]>();
  for (const task of work.tasks) {
    const date = task.due_date ? String(task.due_date).slice(0, 10) : null;
    if (!date || date < today || date > end || !(task.status === "Pending" || task.status === "In Progress")) continue;
    dueByDay.set(date, [...(dueByDay.get(date) ?? []), task.title]);
  }
  for (const [date, titles] of dueByDay) {
    rows.push({ date, title: titles.length === 1 ? `Task due: ${titles[0]}` : `${titles.length} tasks due`, line: titles.length > 1 ? titles.slice(0, 2).join(" · ") : "With your interns", to: "/supervisor/tasks" });
  }
  const reports = work.queue.filter((item) => item.kind === "journal").length;
  if (reports > 0) rows.push({ date: today, title: "Weekly reports", line: `${reports} to read`, to: "/supervisor/journals" });
  // The month's time records are certified at its end.
  const monthEnd = (() => {
    const [year, month] = today.split("-").map(Number);
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return `${today.slice(0, 8)}${String(last).padStart(2, "0")}`;
  })();
  if (monthEnd <= end && work.interns.length > 0) {
    rows.push({ date: monthEnd, title: `Certify ${formatPhDay(monthEnd, { month: "long" })} time records`, line: `${work.interns.length} ${work.interns.length === 1 ? "intern" : "interns"}`, to: "/supervisor/time-record" });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Card>
      <h2 className="px-4 pt-3.5 text-[16px] font-bold text-slate-900">This week</h2>
      {rows.length === 0 ? (
        <p className="px-4 pb-4 pt-1 text-[14px] text-slate-600">Nothing dated this week.</p>
      ) : (
        <ul className="mt-2 divide-y divide-(--role-hairline) border-t border-(--role-hairline)">
          {rows.slice(0, 6).map((row) => (
            <li key={`${row.date}-${row.title}`}>
              <Link to={row.to} className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-psu-50/50">
                <span className="w-11 shrink-0 rounded-lg bg-psu-50 py-1 text-center leading-none" aria-hidden="true">
                  <span className="block text-[10.5px] font-bold uppercase text-psu-700">{formatPhDay(row.date, { weekday: "short" })}</span>
                  <span className="font-display tabular block text-[18px] font-extrabold text-slate-900">{formatPhDay(row.date, { day: "numeric" })}</span>
                </span>
                <span className="min-w-0">
                  <span className="sr-only">{formatDayDate(row.date)}: </span>
                  <span className="block truncate text-[14.5px] font-bold text-slate-900">{row.title}</span>
                  <span className="block truncate text-[13px] text-slate-600">{row.line}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------- Plain fact cards (computers) ---------- */

export function FactCard({ title, value, unit, line, tip, to, action }: { title: string; value: number; unit: string; line: string; tip: string; to: string; action: string }) {
  return (
    <div className="card-hairline flex flex-col rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[13.5px] font-bold text-slate-800">{title}</h3>
        <InfoTip label={`About ${title.toLowerCase()}`} text={tip} />
      </div>
      <p className="mt-1">
        <span className="font-display tabular text-[30px] font-extrabold leading-none text-slate-900">{value}</span>{" "}
        <span className="text-[14px] text-slate-700">{unit}</span>
      </p>
      <p className="mt-1 text-[13px] text-slate-600">{line}</p>
      <Link to={to} className="mt-auto inline-flex min-h-11 items-center gap-1 pt-1 text-sm font-bold text-psu-700 hover:underline">
        {action}
        <Icon name="arrow-right" size={15} />
      </Link>
    </div>
  );
}
