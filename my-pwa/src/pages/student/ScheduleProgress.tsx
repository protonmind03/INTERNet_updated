import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader } from "../../components/ui";
import ProjectionHow from "../../components/ProjectionHow";
import { API_URL, withStudentAuth } from "../../lib/api";
import { formatDayDate, formatHours, phDateKey } from "../../lib/format";
import { savedFetch } from "../../lib/offlineStore";
import { daysBetween } from "../../lib/phTime";
import { useAccount } from "../../lib/session";
import { useMediaQuery } from "../../lib/useMediaQuery";
import {
  addDays,
  calendarIndex,
  countedFrom,
  type CalendarHoliday,
  type CalendarShift,
  type ShiftPattern,
} from "../../lib/studentCalendar";
import { logDateKey } from "./useAttendance";
import { useTimeIn } from "./timeInContext";

/*
|--------------------------------------------------------------------------
| MY PROGRESS
|--------------------------------------------------------------------------
|
| Iteration 21. Four panels, in this order:
|
|   1. Burn-up: cumulative verified hours (solid), pending (dashed), the
|      scheduled plan (thin), the required hours (target line) and the
|      projected finish. Tap or hover a day for its values. "If you keep to
|      your schedule", with how the date was worked out.
|   2. Milestones: 25, 50, 75 and 100%, each with the day it was reached or
|      the day it is expected.
|   3. Change since last week: how far the projected finish has moved,
|      from the server's daily snapshots.
|   4. Rhythm: weeks by days, shaded by the hours rendered, late days
|      dotted, half days split.
|
| SVG in the brand's colours, each with an accessible name and a text
| summary. Built from the saved lists and the saved projection, so it
| works with no connection.
|
*/

type Projection = {
  projected_end_date: string | null;
  remaining_hours: number;
  history?: { date: string; projected_end_date: string | null }[];
};

/** The chart is drawn narrower on a phone, so its labels stay legible when it is scaled to the screen. */
const WIDE = 640;
const NARROW = 360;
const HEIGHT = 220;
const PAD = { left: 40, right: 12, top: 12, bottom: 28 };

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
  const WIDTH = useMediaQuery("(max-width: 639px)") ? NARROW : WIDE;

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

  const shown = hover !== null ? series.points[hover] : null;
  const summary = `${formatHours(verifiedNow)} verified of ${formatHours(required)} required. ${
    series.finish ? `Projected finish ${formatDayDate(series.finish)}.` : "No projected finish yet."
  }`;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Hours over time" description="If you keep to your schedule." />
        <div className="px-4 pb-4 sm:px-5">
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
            {[0, 0.25, 0.5, 0.75, 1].map((share) => (
              <g key={share}>
                <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(top * share)} y2={y(top * share)} className="chart-grid" />
                <text x={PAD.left - 6} y={y(top * share) + 4} textAnchor="end" className="chart-axis">
                  {Math.round(top * share)}
                </text>
              </g>
            ))}
            {required > 0 && <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(required)} y2={y(required)} className="chart-target" />}
            <path d={line((point) => point.plan)} className="chart-plan" />
            <path d={line((point) => point.pending, pastCount)} className="chart-pending" />
            <path d={line((point) => point.verified, pastCount)} className="chart-verified" />
            <line x1={x(todayIndex)} x2={x(todayIndex)} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="chart-today" />
            {finishIndex >= 0 && (
              <g>
                <circle cx={x(finishIndex)} cy={y(required)} r="6" className="chart-finish" />
                <text x={x(finishIndex)} y={y(required) - 10} textAnchor="middle" className="chart-axis">
                  Finish
                </text>
              </g>
            )}
            {shown && hover !== null && (
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="chart-hover" />
            )}
          </svg>
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
        </div>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader title="Milestones" />
          <ol className="space-y-2 px-4 pb-4 sm:px-5" aria-label="Milestones">
            {milestones.map((milestone) => (
              <li key={milestone.share} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 font-semibold text-slate-900">
                  <span aria-hidden="true" className={`cal-dot ${milestone.reached ? "cal-dot--verified" : "cal-dot--absent"}`} />
                  {milestone.share}%
                </span>
                <span className="text-slate-700">
                  {milestone.date ? `${milestone.reached ? "Reached" : "Expected"} ${formatDayDate(milestone.date)}` : "Not worked out yet"}
                </span>
              </li>
            ))}
          </ol>
        </Card>

        <Card>
          <CardHeader title="Change since last week" />
          <p className="px-4 pb-4 text-sm text-slate-700 sm:px-5">
            {moved === null
              ? "Not enough history yet: this shows once a week of daily projections is kept."
              : moved === 0
                ? "Your projected finish has not moved."
                : `Your projected finish moved ${Math.abs(moved)} ${Math.abs(moved) === 1 ? "day" : "days"} ${moved < 0 ? "earlier" : "later"}.`}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader title="Rhythm" description="The last eight weeks, Sunday to Saturday. Darker is more hours." />
        <div className="px-4 pb-4 sm:px-5">
          <svg viewBox="0 0 280 260" role="img" aria-label={`Rhythm of the last eight weeks: ${rhythm.flat().filter((cell) => cell.hours > 0).length} days with hours, ${rhythm.flat().filter((cell) => cell.late).length} late.`} className="h-auto w-full max-w-md">
            {["S", "M", "T", "W", "T", "F", "S"].map((name, index) => (
              <text key={index} x={36 + index * 34 + 14} y="12" textAnchor="middle" className="chart-axis">
                {name}
              </text>
            ))}
            {rhythm.map((week, row) => (
              <g key={week[0].date}>
                <text x="26" y={20 + row * 30 + 18} textAnchor="end" className="chart-axis">
                  {formatDayDate(week[0].date).replace(/^\w+,\s*/, "").split(",")[0]}
                </text>
                {week.map((cell, column) => {
                  const cx = 36 + column * 34;
                  const cy = 20 + row * 30;
                  const shade = cell.future ? 0 : Math.min(1, cell.hours / mostHours);
                  return (
                    <g key={cell.date}>
                      <rect x={cx} y={cy} width="28" height="26" rx="5" className="rhythm-empty" />
                      {shade > 0 && (
                        <rect
                          x={cx}
                          y={cell.half ? cy + 13 : cy}
                          width="28"
                          height={cell.half ? 13 : 26}
                          rx="5"
                          className="rhythm-fill"
                          style={{ opacity: 0.25 + shade * 0.75 }}
                        />
                      )}
                      {cell.late && <circle cx={cx + 22} cy={cy + 6} r="3" className="dot-late-mark" />}
                    </g>
                  );
                })}
              </g>
            ))}
          </svg>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
            <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3 rounded-sm rhythm-swatch" />Hours rendered</li>
            <li className="flex items-center gap-1.5"><span aria-hidden="true" className="cal-dot cal-dot--late" />Late</li>
            <li>A half-filled square is a half day.</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}
