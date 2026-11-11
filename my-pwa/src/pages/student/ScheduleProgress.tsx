import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../../components/Icon";
import ProjectionHow from "../../components/ProjectionHow";
import { API_URL, withStudentAuth } from "../../lib/api";
import { formatDayDate, formatHours, phDateKey } from "../../lib/format";
import { savedFetch } from "../../lib/offlineStore";
import { daysBetween, formatPh } from "../../lib/phTime";
import { useAccount } from "../../lib/session";
import { useMediaQuery } from "../../lib/useMediaQuery";
import {
  addDays,
  calendarIndex,
  countedFrom,
  weeklyShiftHours,
  type CalendarHoliday,
  type CalendarShift,
  type ShiftPattern,
} from "../../lib/studentCalendar";
import { logDateKey } from "./useAttendance";
import { useTimeIn } from "./timeInContext";

/*
|--------------------------------------------------------------------------
| MY PROGRESS (Attendance folder; rebuilt for change1108)
|--------------------------------------------------------------------------
|
| Before, this page opened on a chart that showed nothing until hours were
| verified, and a grid of empty squares, so it read as blank and hard to
| follow. Now it answers three questions, in order, each in plain words
| first and a drawing second:
|
|   1. Where am I?        Your OJT journey: a road from the first day to
|                         the finish, in the portal's time-card motif. The
|                         verified stretch is paved, the stretch waiting for
|                         the supervisor is dashed, and the 25, 50, 75 and
|                         100% milestones are stops on it, each with the day
|                         it was reached or is expected.
|   2. What are my hours? Where your hours are: verified, waiting for the
|                         supervisor, needing a fix (with the way to fix
|                         them) and still to go, as one bar and four lines.
|   3. Am I on pace?      Your pace: what the schedule plans in a week
|                         beside what was done in the last four, a verdict
|                         in words, and how far the expected finish moved
|                         since last week.
|
| Then the detail for whoever wants it: the burn-up chart (with what it
| will show before there is anything to show) and the eight-week rhythm.
| Built from the saved lists and the saved projection, so it works with no
| connection.
|
*/

type Projection = {
  projected_end_date: string | null;
  remaining_hours: number;
  history?: { date: string; projected_end_date: string | null }[];
};

/** The chart is drawn narrower on a phone, so its labels stay legible when it is scaled to the screen. */
const WIDE = 640;
const WIDEST = 980;
const NARROW = 360;
const HEIGHT = 230;
const PAD = { left: 40, right: 24, top: 26, bottom: 24 };

const round1 = (value: number) => Math.round(value * 10) / 10;

export default function ScheduleProgress({
  shifts,
  pattern,
  holidays,
  termStart,
}: {
  shifts: CalendarShift[];
  pattern?: ShiftPattern | null;
  holidays: CalendarHoliday[];
  termStart: string | null;
}) {
  const student = useAccount("student");
  const { attendance } = useTimeIn();
  const logs = attendance.logs;
  const today = phDateKey(new Date());
  const required = Number(student?.required_hours) || 0;
  const [projection, setProjection] = useState<Projection | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const narrow = useMediaQuery("(max-width: 639px)");
  const widest = useMediaQuery("(min-width: 1100px)");
  const WIDTH = narrow ? NARROW : widest ? WIDEST : WIDE;

  useEffect(() => {
    if (!student?.student_id) return;
    let active = true;
    savedFetch("student", "projection", `${API_URL}/api/students/${encodeURIComponent(student.student_id)}/projection`, withStudentAuth())
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => active && setProjection(data?.projection ?? null))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [student?.student_id]);

  const series = useMemo(() => {
    const since = countedFrom(logs, termStart) ?? today;
    const finish = projection?.projected_end_date && projection.projected_end_date > today ? projection.projected_end_date : today;
    const end = finish > today ? finish : addDays(today, 7);
    const day = calendarIndex({ shifts, pattern, holidays, logs, absences: [], tasks: [] });
    const byDate = new Map(logs.map((log) => [logDateKey(log), log]));
    const points: { date: string; verified: number; pending: number; plan: number }[] = [];
    let verified = 0;
    let pending = 0;
    let plan = 0;
    for (let date = since, guard = 0; date <= end && guard < 800; date = addDays(date, 1), guard += 1) {
      const facts = day(date);
      if (facts.shift && !facts.holiday) plan += Number(facts.shift.hours) || 0;
      const log = byDate.get(date);
      if (date <= today && log) {
        if (log.status === "Verified") verified += Number(log.hours) || 0;
        else if (log.status === "Pending") pending += Number(log.hours) || 0;
      }
      points.push({ date, verified, pending: verified + pending, plan });
    }
    return { since, end, points, finish: projection?.projected_end_date ?? null };
  }, [logs, termStart, shifts, pattern, holidays, projection, today]);

  const verifiedNow = series.points.filter((point) => point.date <= today).at(-1)?.verified ?? 0;
  const pendingNow = (series.points.filter((point) => point.date <= today).at(-1)?.pending ?? verifiedNow) - verifiedNow;
  const toFix = logs.filter((log) => log.status === "Rejected" || log.status === "Flagged").reduce((sum, log) => sum + (Number(log.hours) || 0), 0);
  const toFixDays = logs.filter((log) => log.status === "Rejected" || log.status === "Flagged").length;
  const left = Math.max(0, required - verifiedNow);
  const percent = required > 0 ? Math.min(100, Math.round((verifiedNow / required) * 100)) : 0;

  const top = Math.max(required, series.points.at(-1)?.plan ?? 0, verifiedNow, 1);
  const x = (index: number) => PAD.left + (index / Math.max(1, series.points.length - 1)) * (WIDTH - PAD.left - PAD.right);
  const y = (hours: number) => HEIGHT - PAD.bottom - (hours / top) * (HEIGHT - PAD.top - PAD.bottom);
  const line = (pick: (point: (typeof series.points)[number]) => number, until = series.points.length) =>
    series.points
      .slice(0, until)
      .map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${y(pick(point)).toFixed(1)}`)
      .join(" ");
  const todayIndex = Math.max(0, series.points.findIndex((point) => point.date === today));
  const pastCount = todayIndex + 1;
  const finishIndex = series.finish ? series.points.findIndex((point) => point.date === series.finish) : -1;

  // Milestones: reached (the day verified hours crossed it) or expected (the plan from today crosses it).
  const milestones = [25, 50, 75, 100].map((share) => {
    const target = (required * share) / 100;
    const reached = series.points.find((point) => point.date <= today && point.verified >= target && target > 0);
    if (reached) return { share, date: reached.date, reached: true };
    const planToday = series.points[todayIndex]?.plan ?? 0;
    const expected = series.points.find((point) => point.date > today && verifiedNow + (point.plan - planToday) >= target);
    return { share, date: share === 100 && series.finish ? series.finish : expected?.date ?? null, reached: false };
  });

  // Change since last week, from the snapshots.
  const history = projection?.history ?? [];
  const weekAgo = [...history].reverse().find((entry) => entry.date <= addDays(today, -7) && entry.projected_end_date);
  const moved = weekAgo?.projected_end_date && series.finish ? daysBetween(weekAgo.projected_end_date, series.finish) : null;

  // Rhythm: the last 8 weeks, Sunday to Saturday.
  const rhythm = useMemo(() => {
    const byDate = new Map(logs.map((log) => [logDateKey(log), log]));
    const lastSunday = addDays(today, -new Date(`${today}T00:00:00Z`).getUTCDay());
    return Array.from({ length: 8 }, (_, week) => {
      const start = addDays(lastSunday, -7 * (7 - week));
      return Array.from({ length: 7 }, (_, offset) => {
        const date = addDays(start, offset);
        const log = byDate.get(date);
        return {
          date,
          hours: log ? Number(log.hours) || 0 : 0,
          late: (log?.late_minutes ?? 0) > 0,
          half: log?.session === "am" || log?.session === "pm",
          future: date > today,
        };
      });
    });
  }, [logs, today]);
  const mostHours = Math.max(8, ...rhythm.flat().map((cell) => cell.hours));
  const rhythmDays = rhythm.flat().filter((cell) => cell.hours > 0).length;

  // Pace: the schedule's week beside the last four weeks.
  const monthAgo = addDays(today, -28);
  const recent = logs
    .filter((log) => log.time_in && logDateKey(log) > monthAgo && logDateKey(log) <= today && (log.status === "Verified" || log.status === "Pending"))
    .reduce((sum, log) => sum + (Number(log.hours) || 0), 0);
  const pace = round1(recent / 4);
  const planned = round1(weeklyShiftHours(shifts, pattern));
  const startedRecently = daysBetween(series.since, today) < 28;
  const paceVerdict =
    planned === 0
      ? { word: "No schedule yet", tone: "grey", line: "Your coordinator has not set your OJT days yet, so there is nothing to compare with." }
      : recent === 0
        ? { word: "Not started", tone: "grey", line: `Your schedule plans ${planned} hours a week. Your pace shows here after your first days.` }
        : pace >= planned * 0.95
          ? { word: "On pace", tone: "good", line: `You are keeping up with your schedule${pace > planned * 1.05 ? `, ${round1(pace - planned)} hours a week ahead` : ""}.` }
          : startedRecently
            ? { word: "Getting started", tone: "info", line: "You started less than four weeks ago, so this average is still filling in." }
            : { word: "Behind", tone: "bad", line: `About ${round1(planned - pace)} hours a week short of your schedule. Days not worked push your finish later.` };
  const paceTop = Math.max(planned, pace, 1);

  const shown = hover !== null ? series.points[hover] : null;
  const summary = `${formatHours(verifiedNow)} verified of ${formatHours(required)} required. ${
    series.finish ? `Projected finish ${formatDayDate(series.finish)}.` : "No projected finish yet."
  }`;
  const finishWords = series.finish ? formatPh(new Date(`${series.finish}T12:00:00+08:00`), { month: "long", day: "numeric", year: "numeric" }) : null;
  const short = (date: string) => formatPh(new Date(`${date}T12:00:00+08:00`), { month: "short", day: "numeric" });

  const share = (hours: number) => (required > 0 ? Math.min(100, (hours / required) * 100) : 0);
  const verifiedShare = share(verifiedNow);
  const pendingShare = Math.min(100 - verifiedShare, share(pendingNow));

  return (
    <div className="space-y-4">
      {/* 1. Where am I? */}
      <section aria-labelledby="journey" className="overflow-hidden rounded-[20px] bg-white ring-1 ring-inset ring-(--role-hairline)">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-4 pt-4 sm:px-5 sm:pt-5">
          <div className="min-w-0">
            <h2 id="journey" className="eyebrow text-psu-800">
              Your OJT journey
            </h2>
            <p className="mt-1 font-display tabular text-[30px] font-extrabold leading-none tracking-tight text-slate-900 sm:text-[36px]">
              {round1(verifiedNow)}
              <span className="text-[17px] font-bold text-slate-500 sm:text-[19px]"> of {required || "—"} hours</span>
            </p>
          </div>
          <dl className="tabular flex gap-5 text-[13px]">
            <div>
              <dt className="text-slate-500">Done</dt>
              <dd className="text-[17px] font-extrabold text-slate-900">{percent}%</dd>
            </div>
            <div>
              <dt className="text-slate-500">To go</dt>
              <dd className="text-[17px] font-extrabold text-slate-900">{round1(left)} h</dd>
            </div>
            <div>
              <dt className="text-slate-500">Expected finish</dt>
              <dd className="text-[17px] font-extrabold text-slate-900">{series.finish ? short(series.finish) : "—"}</dd>
            </div>
          </dl>
        </div>
        <p className="px-4 pt-2 text-[14px] leading-relaxed text-slate-700 max-md:hidden sm:px-5">
          {required === 0
            ? "Your required hours have not been set yet."
            : left === 0
              ? `You have completed your ${required} required hours.`
              : `${verifiedNow === 0 ? "No hours are verified yet" : `${percent}% of the way there`}${pendingNow > 0 ? `; ${round1(pendingNow)} more ${pendingNow === 1 ? "hour is" : "hours are"} waiting for your supervisor` : ""}. Keeping to your schedule, you finish${finishWords ? ` on ${finishWords}` : " once your schedule is set"}.`}
        </p>

        {/* The road: paved where verified, dashed where waiting; milestones are its stops. */}
        <div className="journey px-4 pb-5 pt-9 sm:px-6">
          <div className="journey-road" role="img" aria-label={`The road to ${required} hours: ${percent}% verified${pendingNow > 0 ? `, ${round1(pendingNow)} hours waiting` : ""}.`}>
            <span className="journey-paved" style={{ width: `${verifiedShare}%` }} />
            <span className="journey-waiting" style={{ left: `${verifiedShare}%`, width: `${pendingShare}%` }} />
            <span className="journey-lane" aria-hidden="true" />
            <span className="journey-you" style={{ left: `${verifiedShare}%` }} aria-hidden="true">
              <span>You</span>
            </span>
            {milestones.map((milestone) => (
              <span key={milestone.share} className="journey-stop" data-reached={milestone.reached || undefined} style={{ left: `${milestone.share}%` }} aria-hidden="true" />
            ))}
          </div>
          <ol aria-label="Milestones" className="relative mt-3 h-9 text-[11.5px] sm:text-[12.5px]">
            {milestones.map((milestone) => (
              <li key={milestone.share} className={`absolute top-0 max-w-[22%] ${milestone.share === 100 ? "right-0 text-right" : "-translate-x-1/2 text-center"}`} style={milestone.share === 100 ? undefined : { left: `${milestone.share}%` }}>
                <span className="block font-extrabold text-slate-900">
                  {milestone.reached && <Icon name="check" size={12} className="mr-0.5 inline text-(--status-success-ink)" />}
                  {milestone.share}%
                </span>
                <span className="block truncate text-slate-600">
                  {milestone.date ? (
                    <>
                      <span className="max-sm:hidden">{milestone.reached ? "Reached " : "By "}</span>
                      {short(milestone.date)}
                    </>
                  ) : (
                    "Not set"
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 2. What are my hours? */}
        <section aria-labelledby="hours-where" className="rounded-[20px] bg-white p-4 ring-1 ring-inset ring-(--role-hairline) sm:p-5">
          <h2 id="hours-where" className="text-[16px] font-extrabold text-slate-900">
            Where your hours are
          </h2>
          <p className="mt-0.5 text-[13px] text-slate-600">Only verified hours count.</p>
          <div aria-hidden="true" className="mt-3 flex h-3.5 overflow-hidden rounded-full bg-psu-100">
            <span className="bg-psu-700" style={{ width: `${verifiedShare}%` }} />
            <span className="hours-waiting" style={{ width: `${pendingShare}%` }} />
            <span className="bg-(--status-late-ink)" style={{ width: `${Math.min(100 - verifiedShare - pendingShare, share(toFix))}%` }} />
          </div>
          <ul className="mt-3 divide-y divide-(--role-hairline) text-[14px]">
            {[
              { key: "Verified", value: verifiedNow, swatch: "bg-psu-700", line: "" },
              { key: "Waiting", value: pendingNow, swatch: "hours-waiting", line: "Counts once verified, or by itself two working days after a clean day." },
              { key: "Needs a fix", value: toFix, swatch: "bg-(--status-late-ink)", line: toFixDays > 0 ? `${toFixDays} ${toFixDays === 1 ? "day was" : "days were"} rejected or flagged.` : "Nothing rejected or flagged." },
              { key: "Still to go", value: left, swatch: "bg-psu-100 ring-1 ring-inset ring-psu-300", line: "" },
            ].map((row) => (
              <li key={row.key} className="flex items-start gap-3 py-2">
                <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${row.swatch}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900">{row.key}</p>
                  {row.line && <p className="text-[13px] text-slate-600">{row.line}</p>}
                </div>
                <p className="tabular shrink-0 text-[15px] font-extrabold text-slate-900">{round1(row.value)} h</p>
              </li>
            ))}
          </ul>
          {toFixDays > 0 && (
            <Link to="/daily-log" className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-lg text-[13.5px] font-bold text-psu-700 hover:underline">
              See what to fix in Days
              <Icon name="arrow-right" size={15} />
            </Link>
          )}
        </section>

        {/* 3. Am I on pace? */}
        <section aria-labelledby="pace" className="rounded-[20px] bg-white p-4 ring-1 ring-inset ring-(--role-hairline) sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="pace" className="text-[16px] font-extrabold text-slate-900">
                Your pace
              </h2>
              <p className="mt-0.5 text-[13px] text-slate-600 max-md:hidden">Hours a week: your schedule, and what you did lately.</p>
            </div>
            <span className={`inb-stamp attention-stamp inb-stamp--${paceVerdict.tone}`}>{paceVerdict.word}</span>
          </div>
          <div className="mt-4 space-y-3">
            {[
              { label: "Your schedule plans", value: planned, className: "bg-psu-200" },
              { label: "You did, last 4 weeks", value: pace, className: "bg-psu-700" },
            ].map((bar) => (
              <div key={bar.label}>
                <div className="flex items-baseline justify-between text-[13px]">
                  <span className="font-semibold text-slate-700">{bar.label}</span>
                  <span className="tabular font-extrabold text-slate-900">{bar.value} h/week</span>
                </div>
                <div aria-hidden="true" className="mt-1 h-3 overflow-hidden rounded-full bg-slate-100">
                  <span className={`block h-full rounded-full ${bar.className}`} style={{ width: `${Math.round((bar.value / paceTop) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[13.5px] leading-relaxed text-slate-700">{paceVerdict.line}</p>
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-psu-50 px-3 py-2 text-[13px] text-slate-700">
            <Icon name="trend-up" size={15} className="mt-0.5 shrink-0 text-psu-700" />
            <span>
              <b className="font-bold text-slate-900">Since last week: </b>
              {moved === null
                ? "your expected finish is tracked daily; the change shows once a week of it is kept."
                : moved === 0
                  ? "your expected finish has not moved."
                  : `your expected finish moved ${Math.abs(moved)} ${Math.abs(moved) === 1 ? "day" : "days"} ${moved < 0 ? "earlier" : "later"}.`}
            </span>
          </p>
        </section>
      </div>

      {/* The detail. */}
      <section aria-labelledby="over-time" className="rounded-[20px] bg-white p-4 ring-1 ring-inset ring-(--role-hairline) sm:p-5">
        <h2 id="over-time" className="text-[16px] font-extrabold text-slate-900">
          Hours over time
        </h2>
        <p className="mt-0.5 text-[13px] text-slate-600">Grey: your plan. Solid: your verified hours.</p>
        <div className="relative mt-2">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-label={`Burn-up chart. ${summary}`}
            className="h-auto w-full"
            onPointerMove={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              const at = ((event.clientX - box.left) / box.width) * WIDTH;
              const index = Math.round(((at - PAD.left) / (WIDTH - PAD.left - PAD.right)) * (series.points.length - 1));
              setHover(Math.max(0, Math.min(series.points.length - 1, index)));
            }}
            onPointerLeave={() => setHover(null)}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((step) => (
              <g key={step}>
                <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(top * step)} y2={y(top * step)} className="chart-grid" />
                <text x={PAD.left - 6} y={y(top * step) + 4} textAnchor="end" className="chart-axis">
                  {Math.round(top * step)}
                </text>
              </g>
            ))}
            {required > 0 && <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(required)} y2={y(required)} className="chart-target" />}
            <path d={line((point) => point.plan)} className="chart-plan" />
            <path d={line((point) => point.pending, pastCount)} className="chart-pending" />
            <path d={line((point) => point.verified, pastCount)} className="chart-verified" />
            <line x1={x(todayIndex)} x2={x(todayIndex)} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="chart-today" />
            <text x={x(todayIndex)} y={HEIGHT - 6} textAnchor="middle" className="chart-axis">
              Today
            </text>
            {finishIndex >= 0 && (
              <g>
                <circle cx={x(finishIndex)} cy={y(required)} r="6" className="chart-finish" />
                <text x={Math.min(x(finishIndex), WIDTH - PAD.right - 18)} y={y(required) - 11} textAnchor="middle" className="chart-axis">
                  Finish
                </text>
              </g>
            )}
            {shown && hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="chart-hover" />}
          </svg>
          {verifiedNow === 0 && pendingNow === 0 && (
            <p className="pointer-events-none absolute left-1/2 top-[38%] w-[min(22rem,80%)] -translate-x-1/2 rounded-xl bg-white/90 px-3 py-2 text-center text-[13px] text-slate-700 shadow-sm ring-1 ring-(--role-hairline)">
              Your line starts with your first day. Until then, the grey line shows where your schedule takes you.
            </p>
          )}
        </div>
        <p className="mt-2 min-h-5 text-sm text-slate-700" aria-live="polite">
          {shown
            ? `${formatDayDate(shown.date)}: ${formatHours(shown.verified)} verified${shown.date <= today ? `, ${formatHours(shown.pending - shown.verified)} waiting` : ""}, ${formatHours(shown.plan)} planned.`
            : summary}
        </p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
          <li className="flex items-center gap-1.5"><span aria-hidden="true" className="legend-line legend-line--verified" />Verified</li>
          <li className="flex items-center gap-1.5"><span aria-hidden="true" className="legend-line legend-line--pending" />Waiting</li>
          <li className="flex items-center gap-1.5"><span aria-hidden="true" className="legend-line legend-line--plan" />Scheduled plan</li>
          <li className="flex items-center gap-1.5"><span aria-hidden="true" className="legend-line legend-line--target" />Required hours</li>
        </ul>
        {student?.student_id && (
          <div className="mt-3">
            <ProjectionHow role="student" studentId={student.student_id} />
          </div>
        )}
      </section>

      <section aria-labelledby="rhythm" className="rounded-[20px] bg-white p-4 ring-1 ring-inset ring-(--role-hairline) sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="rhythm" className="text-[16px] font-extrabold text-slate-900">
            Rhythm
          </h2>
          <p className="tabular text-[13px] font-semibold text-slate-600">{rhythmDays} days worked in 8 weeks</p>
        </div>
        <p className="mt-0.5 text-[13px] text-slate-600">The last eight weeks, one row a week, Sunday to Saturday. Darker is more hours.</p>
        <div className="mt-3 sm:flex sm:items-start sm:gap-8">
          <svg
            viewBox="0 0 300 262"
            role="img"
            aria-label={`Rhythm of the last eight weeks: ${rhythmDays} days with hours, ${rhythm.flat().filter((cell) => cell.late).length} late.`}
            className="h-auto w-full max-w-[360px] shrink-0"
          >
            {["S", "M", "T", "W", "T", "F", "S"].map((name, index) => (
              <text key={index} x={56 + index * 34 + 14} y="12" textAnchor="middle" className="chart-axis">
                {name}
              </text>
            ))}
            {rhythm.map((week, row) => (
              <g key={week[0].date}>
                <text x="48" y={20 + row * 30 + 17} textAnchor="end" className="chart-axis">
                  {short(week[0].date)}
                </text>
                {week.map((cell, column) => {
                  const cx = 56 + column * 34;
                  const cy = 20 + row * 30;
                  const shade = cell.future ? 0 : Math.min(1, cell.hours / mostHours);
                  return (
                    <g key={cell.date}>
                      <rect x={cx} y={cy} width="28" height="26" rx="5" className={cell.future ? "rhythm-future" : "rhythm-empty"} />
                      {shade > 0 && (
                        <rect x={cx} y={cell.half ? cy + 13 : cy} width="28" height={cell.half ? 13 : 26} rx="5" className="rhythm-fill" style={{ opacity: 0.25 + shade * 0.75 }} />
                      )}
                      {cell.date === today && <rect x={cx - 1.5} y={cy - 1.5} width="31" height="29" rx="6" className="rhythm-today" />}
                      {cell.late && <circle cx={cx + 22} cy={cy + 6} r="3" className="dot-late-mark" />}
                    </g>
                  );
                })}
              </g>
            ))}
          </svg>
          <ul className="mt-3 space-y-1.5 text-[12.5px] text-slate-700 sm:mt-6">
            <li className="flex items-center gap-2"><span aria-hidden="true" className="h-3 w-3 rounded-sm rhythm-swatch" />Hours rendered</li>
            <li className="flex items-center gap-2"><span aria-hidden="true" className="cal-dot cal-dot--late" />Late that day</li>
            <li className="flex items-center gap-2"><span aria-hidden="true" className="h-3 w-3 rounded-sm ring-2 ring-psu-700" />Today</li>
            <li>A half-filled square is a half day.</li>
            {rhythmDays === 0 && <li className="pt-1 text-slate-600">Your squares fill in as you work your OJT days.</li>}
          </ul>
        </div>
      </section>
    </div>
  );
}
