import { useId, useMemo, useState } from "react";
import { ColumnChart } from "../../components/charts";
import { Card, CardHeader } from "../../components/ui";
import { formatDate, formatHours, formatLongDate, phDateKey } from "../../lib/format";
import { useAccount } from "../../lib/session";
import {
  LATE_AFTER_MINUTES,
  attendanceOnScheduledDays,
  countedFrom,
  punctuality,
  weeklyHours,
  type CalendarHoliday,
  type CalendarShift,
} from "../../lib/studentCalendar";
import { useProjections } from "../../lib/useProjections";
import { useTimeIn } from "./timeInContext";

/*
|--------------------------------------------------------------------------
| MY PROGRESS
|--------------------------------------------------------------------------
|
| How the OJT is going, in the student's own figures: hours verified each
| week against what was scheduled, how often they timed in on the days
| they were scheduled, how their time-in compares with their shift's
| start, how many hours are left, and when they will finish at this pace.
|
| All of it but the projected finish is worked out here from the saved
| lists (lib/studentCalendar.ts), so it is the same with no connection.
| The projection is the server's; without a connection it is left out.
|
*/

/** A figure with a "?" that says exactly how it is counted. */
function Figure({
  label,
  value,
  note,
  explain,
}: {
  label: string;
  value: string;
  note?: string;
  explain: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-slate-600">{label}</p>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((shown) => !shown)}
          className="-mr-1.5 -mt-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-slate-600 hover:bg-slate-100"
        >
          <span aria-hidden="true">?</span>
          <span className="sr-only">How "{label}" is counted</span>
        </button>
      </div>
      <p className="tabular mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      {note && <p className="mt-0.5 text-xs text-slate-600">{note}</p>}
      <p id={id} hidden={!open} className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-xs leading-relaxed text-slate-700">
        {explain}
      </p>
    </div>
  );
}

export default function ScheduleProgress({
  shifts,
  holidays,
  termStart,
}: {
  shifts: CalendarShift[];
  holidays: CalendarHoliday[];
  termStart: string | null;
}) {
  const student = useAccount("student");
  const { attendance } = useTimeIn();
  const logs = attendance.logs;
  const projection = [...useProjections("student").values()][0];
  const today = phDateKey(new Date());

  const figures = useMemo(() => {
    const since = countedFrom(logs, termStart);
    const sources = { shifts, holidays, logs };
    return {
      since,
      weeks: weeklyHours(today, since, sources),
      attended: attendanceOnScheduledDays(today, since, sources),
      punctual: punctuality(sources),
    };
  }, [logs, termStart, shifts, holidays, today]);

  const required = Number(student?.required_hours) || 0;
  const verified = Math.round(logs.reduce((sum, log) => sum + (log.status === "Verified" ? Number(log.hours) || 0 : 0), 0) * 100) / 100;
  const remaining = Math.max(0, Math.round((required - verified) * 100) / 100);
  const waiting = Math.round(
    logs.reduce((sum, log) => sum + (log.status === "Pending" && log.time_out ? Number(log.hours) || 0 : 0), 0) * 100
  ) / 100;
  const weeklyScheduled = shifts.reduce((sum, shift) => sum + (Number(shift.hours) || 0), 0);

  const { attended, punctual, weeks } = figures;
  const rate = attended.scheduled > 0 ? Math.round((attended.attended / attended.scheduled) * 100) : null;
  const average = punctual.average;
  const anyHours = weeks.some((week) => week.verified > 0 || week.scheduled > 0);

  return (
    <div className="space-y-5">
      <Card className="min-w-0">
        <CardHeader
          title="Verified hours each week"
          description={
            weeklyScheduled > 0
              ? `Against ${formatHours(weeklyScheduled)} scheduled in a full week. A darker column is a week that met its schedule.`
              : "No schedule is set yet, so there is nothing to compare the weeks with."
          }
        />
        <div className="px-4 pb-4 pt-7 sm:px-5">
          {!anyHours ? (
            <p className="py-8 text-center text-sm text-slate-600">
              No hours yet. A week appears here once a log in it is verified.
            </p>
          ) : (
            <ColumnChart
              points={weeks.map((week) => ({
                key: week.week_start,
                label: `Week of ${formatDate(week.week_start).replace(/, \d{4}$/, "")}`,
                axisLabel: formatDate(week.week_start).replace(/, \d{4}$/, ""),
                value: week.verified,
                detail:
                  week.scheduled > 0
                    ? `${formatHours(week.scheduled)} scheduled`
                    : "Nothing scheduled that week",
                // Darker when the week's schedule was met.
                color: week.scheduled > 0 && week.verified >= week.scheduled ? "#0f1e6e" : "#637bf4",
              }))}
              label="Verified hours in each of the last eight weeks"
              format={(value) => formatHours(value)}
              height={150}
            />
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Figure
          label="Attendance on scheduled days"
          value={rate === null ? "–" : `${rate}%`}
          note={
            attended.scheduled > 0
              ? `${attended.attended} of ${attended.scheduled} scheduled ${attended.scheduled === 1 ? "day" : "days"}`
              : "No scheduled day has passed yet"
          }
          explain={`Of the days you were scheduled to work${
            figures.since ? ` since ${formatLongDate(figures.since)}` : ""
          }, up to yesterday and leaving out holidays, the share on which you timed in. A day you filed an absence for still counts as a day you did not time in.`}
        />
        <Figure
          label="Average time-in"
          value={
            punctual.days === 0
              ? "–"
              : average === 0
                ? "On time"
                : `${Math.abs(average)} min ${average > 0 ? "late" : "early"}`
          }
          note={
            punctual.days === 0
              ? "No time-in on a scheduled day yet"
              : `Late on ${punctual.late} of ${punctual.days} ${punctual.days === 1 ? "day" : "days"}`
          }
          explain={`Your time-in compared with the start of your shift that day, averaged over the days you timed in on a scheduled day. A time-in more than ${LATE_AFTER_MINUTES} minutes after the shift starts counts as late. It is measured against your schedule as it is now.`}
        />
        <Figure
          label="Hours still needed"
          value={required > 0 ? formatHours(remaining) : "–"}
          note={
            required > 0
              ? `${formatHours(verified)} of ${formatHours(required)} verified${
                  waiting > 0 ? ` · ${formatHours(waiting)} waiting for your supervisor` : ""
                }`
              : "Your required hours are not set yet"
          }
          explain="Your required hours less the hours your supervisor has verified. Hours on a log that is still waiting, or was rejected, are not counted until it is verified."
        />
      </div>

      <Card className="p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-900">Projected finish</h2>
        {!projection ? (
          <p className="mt-2 text-sm text-slate-600">
            The projection needs a connection. It is worked out from your schedule and your verified
            hours.
          </p>
        ) : projection.remaining_hours === 0 ? (
          <p className="mt-2 text-sm text-slate-800">
            You have completed your required hours.
          </p>
        ) : projection.projected_finish ? (
          <>
            <p className="tabular mt-2 text-xl font-bold tracking-tight text-slate-900">
              {formatLongDate(projection.projected_finish)}
            </p>
            <p className="mt-1 text-sm text-slate-700">
              At your schedule of {formatHours(projection.weekly_hours)} a week, with{" "}
              {formatHours(projection.remaining_hours)} still to verify. Holidays are already left
              out. It is an estimate from your schedule: working more or fewer hours than scheduled
              moves it.
            </p>
            {projection.at_risk && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-950 ring-1 ring-inset ring-amber-600/20">
                {projection.risk_reason} Talk to your supervisor or OJT coordinator about your
                schedule.
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-800">
            {projection.risk_reason || "A finish date cannot be worked out yet."} You have{" "}
            {formatHours(projection.remaining_hours)} still to verify.
          </p>
        )}
      </Card>
    </div>
  );
}
