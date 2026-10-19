import { useEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "../../components/ui";
import { API_URL, withStudentAuth } from "../../lib/api";
import { formatDayDate, formatHours } from "../../lib/format";
import { savedFetch } from "../../lib/offlineStore";
import { phToday } from "../../lib/phTime";
import { useHolidays } from "../../lib/useHolidays";
import { useProjections } from "../../lib/useProjections";
import { useScrollPane } from "../../lib/useScrollPane";
import { addDays, shiftOn, weekdayOf, type CalendarShift, type ShiftPattern } from "../../lib/studentCalendar";
import { logDateKey, workedMinutes, type AttendanceLog } from "./useAttendance";

/*
|--------------------------------------------------------------------------
| THE ATTENDANCE FIGURES
|--------------------------------------------------------------------------
|
| Iteration 20. Three cards above the list of logs, each with a figure, a
| comparison, a small chart drawn from what the page already holds, and an
| action:
|
|   Hours      a ring of verified, pending and remaining hours against the
|              required; the projected finish ("If you keep to your
|              schedule"). Tap: the list shows only pending logs.
|   On time    the share of on-time days over the last 20 scheduled days,
|              and a strip of 20 dots (late tinted, absent hollow, half-day
|              half filled). Late is the server's (late_minutes). Tap: late
|              days.
|   This week  Sunday to Saturday, the scheduled hours as outlines and the
|              rendered hours as fills, today marked. Tap: this week's logs.
|
| Below 600 px the cards are a row that snaps, with three dots; from 600 px
| a three-column grid. The figures count up once on the first load (not
| under reduced motion). Placeholders hold the same size while loading.
|
*/

export type FigureAction = "pending" | "late" | "week";

type DayMark = "on-time" | "late" | "absent" | "half";

/** A number that counts up once, from 0, when it first arrives. */
function useCountUp(target: number, ready: boolean): number {
  const [shown, setShown] = useState(0);
  const done = useRef(false);
  useEffect(() => {
    if (!ready) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (done.current || reduce) {
      done.current = true;
      const frame = requestAnimationFrame(() => setShown(target));
      return () => cancelAnimationFrame(frame);
    }
    done.current = true;
    const started = performance.now();
    let frame = 0;
    const tick = (time: number) => {
      const progress = Math.min(1, (time - started) / 600);
      setShown(target * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ready]);
  return shown;
}

export default function FigureCards({
  studentId,
  logs,
  loading,
  required,
  onAction,
}: {
  studentId: string | undefined;
  logs: AttendanceLog[];
  loading: boolean;
  /** The required hours; null while unknown. */
  required: number | null;
  onAction: (action: FigureAction) => void;
}) {
  const [shifts, setShifts] = useState<CalendarShift[] | null>(null);
  const [pattern, setPattern] = useState<ShiftPattern | null>(null);
  const holidays = useHolidays("student");
  const projection = useProjections("student").get(String(studentId ?? ""));

  useEffect(() => {
    if (!studentId) return;
    let active = true;
    savedFetch("student", "schedule", `${API_URL}/api/ojt-schedule/${encodeURIComponent(studentId)}`, withStudentAuth())
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!active) return;
        setShifts(Array.isArray(data?.schedule) ? data.schedule : []);
        setPattern(data?.pattern?.weeks === 2 ? { weeks: 2, anchor: data.pattern.anchor } : { weeks: 1, anchor: null });
      })
      .catch(() => active && setShifts([]));
    return () => {
      active = false;
    };
  }, [studentId]);

  const today = phToday();
  const ready = !loading && shifts !== null;

  const hours = useMemo(() => {
    const verified = logs.filter((log) => log.status === "Verified").reduce((sum, log) => sum + (Number(log.hours) || 0), 0);
    const pending = logs.filter((log) => log.status === "Pending").reduce((sum, log) => sum + (Number(log.hours) || 0), 0);
    const target = required ?? 0;
    return { verified, pending, remaining: Math.max(0, target - verified - pending), target };
  }, [logs, required]);

  const days = useMemo(() => {
    if (!shifts) return [] as { date: string; mark: DayMark }[];
    const byDate = new Map(logs.map((log) => [logDateKey(log), log]));
    const holidaySet = new Set(holidays.map((holiday) => holiday.date));
    const found: { date: string; mark: DayMark }[] = [];
    for (let date = addDays(today, -1), guard = 0; found.length < 20 && guard < 200; date = addDays(date, -1), guard += 1) {
      const shift = shiftOn(shifts, date, pattern);
      if (!shift || holidaySet.has(date)) continue;
      const log = byDate.get(date);
      const spansNoon = Boolean(shift.start_time && shift.end_time && shift.start_time < "12:00" && shift.end_time > "12:00");
      const mark: DayMark = !log
        ? "absent"
        : spansNoon && (log.session === "am" || log.session === "pm")
          ? "half"
          : (log.late_minutes ?? 0) > 0
            ? "late"
            : "on-time";
      found.push({ date, mark });
    }
    return found.reverse();
  }, [shifts, pattern, logs, holidays, today]);
  const onTime = days.filter((day) => day.mark === "on-time").length;
  const share = days.length > 0 ? Math.round((onTime / days.length) * 100) : 0;

  const week = useMemo(() => {
    const sunday = addDays(today, -new Date(`${today}T00:00:00Z`).getUTCDay());
    const byDate = new Map(logs.map((log) => [logDateKey(log), log]));
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(sunday, index);
      const shift = shifts ? shiftOn(shifts, date, pattern) : undefined;
      const log = byDate.get(date);
      const rendered = log ? (log.hours !== null && log.hours !== undefined ? Number(log.hours) || 0 : workedMinutes(log, new Date()) / 60) : 0;
      return { date, label: weekdayOf(date).slice(0, 1), scheduled: Number(shift?.hours) || 0, rendered, today: date === today };
    });
  }, [shifts, pattern, logs, today]);
  const weekRendered = week.reduce((sum, day) => sum + day.rendered, 0);
  const weekScheduled = week.reduce((sum, day) => sum + day.scheduled, 0);

  const verifiedShown = useCountUp(hours.verified, ready);
  const shareShown = useCountUp(share, ready);
  const weekShown = useCountUp(weekRendered, ready);

  const rowRef = useRef<HTMLDivElement | null>(null);
  const watch = useScrollPane<HTMLDivElement>();
  const [card, setCard] = useState(0);

  return (
    <section aria-label="Your attendance in figures" className="min-w-0 max-w-full">
      <div
        ref={(element) => {
          rowRef.current = element;
          watch(element);
        }}
        data-axis="x"
        tabIndex={0}
        role="group"
        aria-label="Attendance figures; swipe for more"
        className="inb-snap-row figure-cards gap-3"
        onScroll={(event) => {
          const pane = event.currentTarget;
          const width = pane.firstElementChild ? (pane.firstElementChild as HTMLElement).offsetWidth + 12 : pane.clientWidth;
          setCard(Math.round(pane.scrollLeft / Math.max(1, width)));
        }}
      >
        <FigureCard
          title="Hours"
          ready={ready}
          figure={`${formatHours(verifiedShown)}`}
          comparison={hours.target > 0 ? `verified of ${formatHours(hours.target)} required` : "verified"}
          caption={projection?.projected_finish ? `Finish around ${formatDayDate(projection.projected_finish)}. If you keep to your schedule.` : "If you keep to your schedule, your finish shows here."}
          action="Show pending logs"
          onAction={() => onAction("pending")}
          chart={<HoursRing {...hours} />}
          summary={`${formatHours(hours.verified)} verified, ${formatHours(hours.pending)} waiting, ${formatHours(hours.remaining)} to go.`}
        />
        <FigureCard
          title="On time"
          ready={ready}
          figure={days.length > 0 ? `${Math.round(shareShown)}%` : "–"}
          comparison={days.length > 0 ? `of your last ${days.length} scheduled days` : "No scheduled days yet"}
          caption="Late is a time-in after your start minute."
          action="Show late days"
          onAction={() => onAction("late")}
          chart={<DayStrip days={days} />}
          summary={`${onTime} on time, ${days.filter((day) => day.mark === "late").length} late, ${days.filter((day) => day.mark === "absent").length} absent, ${days.filter((day) => day.mark === "half").length} half days.`}
        />
        <FigureCard
          title="This week"
          ready={ready}
          figure={formatHours(weekShown)}
          comparison={weekScheduled > 0 ? `of ${formatHours(weekScheduled)} scheduled` : "nothing scheduled"}
          caption="Sunday to Saturday. Outlines are scheduled; fills are rendered."
          action="Show this week"
          onAction={() => onAction("week")}
          chart={<WeekBars week={week} />}
          summary={week.map((day) => `${weekdayOf(day.date)} ${formatHours(day.rendered)} of ${formatHours(day.scheduled)}`).join("; ")}
        />
      </div>
      <div className="figure-dots mt-2 flex justify-center gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <span key={index} className={`figure-dot ${card === index ? "figure-dot--on" : ""}`} />
        ))}
      </div>
    </section>
  );
}

function FigureCard({
  title,
  ready,
  figure,
  comparison,
  caption,
  action,
  onAction,
  chart,
  summary,
}: {
  title: string;
  ready: boolean;
  figure: string;
  comparison: string;
  caption: string;
  action: string;
  onAction: () => void;
  chart: React.ReactNode;
  summary: string;
}) {
  return (
    <article className="figure-card relative flex shrink-0 snap-start flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      {ready ? (
        <>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="tabular text-3xl font-bold text-slate-900">{figure}</span>
            <span className="text-sm text-slate-600">{comparison}</span>
          </p>
          <div className="mt-3 h-16" aria-hidden="true">
            {chart}
          </div>
          <p className="sr-only">{summary}</p>
          <p className="mt-2 text-xs text-slate-600">{caption}</p>
        </>
      ) : (
        <div className="mt-1 space-y-3" aria-hidden="true">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      )}
      <button type="button" onClick={onAction} disabled={!ready} className="figure-action mt-auto min-h-11 self-start pt-2 text-sm font-semibold underline-offset-2 hover:underline">
        {action}
      </button>
    </article>
  );
}

function HoursRing({ verified, pending, remaining }: { verified: number; pending: number; remaining: number }) {
  const total = Math.max(0.01, verified + pending + remaining);
  const circumference = 2 * Math.PI * 26;
  const arc = (value: number) => (value / total) * circumference;
  return (
    <svg viewBox="0 0 160 64" className="h-16 w-full" role="presentation">
      <g transform="translate(32 32) rotate(-90)">
        <circle r="26" fill="none" strokeWidth="9" className="ring-track" />
        <circle r="26" fill="none" strokeWidth="9" className="ring-pending" strokeDasharray={`${arc(verified + pending)} ${circumference}`} />
        <circle r="26" fill="none" strokeWidth="9" className="ring-verified" strokeDasharray={`${arc(verified)} ${circumference}`} />
      </g>
      <g className="ring-legend" fontSize="10">
        <rect x="72" y="10" width="8" height="8" rx="2" className="ring-verified-fill" />
        <text x="84" y="18">Verified</text>
        <rect x="72" y="28" width="8" height="8" rx="2" className="ring-pending-fill" />
        <text x="84" y="36">Waiting</text>
        <rect x="72" y="46" width="8" height="8" rx="2" className="ring-track-fill" />
        <text x="84" y="54">To go</text>
      </g>
    </svg>
  );
}

function DayStrip({ days }: { days: { date: string; mark: DayMark }[] }) {
  return (
    <svg viewBox="0 0 200 64" className="h-16 w-full" role="presentation">
      {days.map((day, index) => {
        const x = 5 + (index % 10) * 19.5;
        const y = index < 10 ? 20 : 44;
        if (day.mark === "half") {
          return (
            <g key={day.date}>
              <circle cx={x + 4} cy={y} r="6" className="dot-hollow" />
              <path d={`M${x + 4} ${y - 6} A6 6 0 0 1 ${x + 4} ${y + 6} Z`} className="dot-on-time" />
            </g>
          );
        }
        return <circle key={day.date} cx={x + 4} cy={y} r="6" className={`dot-${day.mark}`} />;
      })}
    </svg>
  );
}

function WeekBars({ week }: { week: { date: string; label: string; scheduled: number; rendered: number; today: boolean }[] }) {
  const most = Math.max(1, ...week.map((day) => Math.max(day.scheduled, day.rendered)));
  return (
    <svg viewBox="0 0 196 64" className="h-16 w-full" role="presentation">
      {week.map((day, index) => {
        const x = 4 + index * 28;
        const scheduledHeight = (day.scheduled / most) * 44;
        const renderedHeight = (day.rendered / most) * 44;
        return (
          <g key={day.date}>
            {day.scheduled > 0 && <rect x={x} y={48 - scheduledHeight} width="18" height={scheduledHeight} rx="3" className="bar-scheduled" />}
            {day.rendered > 0 && <rect x={x + 2} y={48 - renderedHeight} width="14" height={renderedHeight} rx="2" className="bar-rendered" />}
            <text x={x + 9} y="61" textAnchor="middle" fontSize="10" className={day.today ? "bar-today" : "bar-label"}>
              {day.label}
            </text>
            {day.today && <circle cx={x + 9} cy="2.5" r="2.5" className="bar-today-dot" />}
          </g>
        );
      })}
    </svg>
  );
}
