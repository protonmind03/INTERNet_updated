import { useState } from "react";
import { Link } from "react-router-dom";
import Icon, { type IconName } from "../../components/Icon";
import { SkeletonRows } from "../../components/ui";
import { formatDuration, formatTime } from "../../lib/format";
import { formatPhDay, phAddDays, phToday } from "../../lib/phTime";
import { logDateKey, workedMinutes, type AttendanceLog } from "./useAttendance";

/*
|--------------------------------------------------------------------------
| THIS WEEK (Attendance, revisions November 2026)
|--------------------------------------------------------------------------
|
| The working week at a glance, laid out so it reads in one look:
|
|   one column per weekday, a large tap target (Fitts) that opens the
|   day's sheet in the month calendar
|   each column says the same things in the same places (proximity and
|   common region): the date, a status stamp in words and a mark (never
|   colour alone), the day's hours as a bar against an 8-hour day, and the
|   times in and out
|   the head keeps to three facts (Miller): hours this week, split into
|   verified and still pending, and days worked
|   arrows step to earlier weeks; Today's own column is outlined
|
*/

type Stamp = { word: string; icon: IconName; className: string };

function stampOf(log: AttendanceLog | undefined, key: string, today: string, working: boolean): Stamp {
  if (working) return { word: "Working", icon: "clock", className: "bg-psu-700 text-white" };
  if (!log?.time_in) return key > today ? { word: "Ahead", icon: "calendar", className: "bg-slate-100 text-slate-500" } : { word: "None", icon: "close", className: "bg-slate-100 text-slate-600" };
  if (!log.time_out && key < today) return { word: "No out", icon: "alert", className: "bg-(--status-late-bg) text-(--status-late-ink)" };
  if (log.status === "Verified") return { word: log.auto_counted ? "Counted" : "Verified", icon: "check", className: "bg-(--status-success-bg) text-(--status-success-ink)" };
  if (log.status === "Rejected" || log.status === "Flagged") return { word: log.status, icon: "flag", className: "bg-(--status-late-bg) text-(--status-late-ink)" };
  return { word: "Pending", icon: "hourglass", className: "bg-(--status-warning-bg) text-(--status-warning-ink)" };
}

export default function ThisWeek({ logs, now, loading }: { logs: AttendanceLog[]; now: Date; loading: boolean }) {
  const today = phToday();
  const [back, setBack] = useState(0);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = phAddDays(today, -((weekday + 6) % 7) - back * 7);

  const days = Array.from({ length: 5 }, (_, index) => {
    const key = phAddDays(monday, index);
    const log = logs.find((item) => logDateKey(item) === key);
    const working = Boolean(log?.time_in && !log.time_out && key === today);
    const minutes = log ? (working ? workedMinutes(log, now) : (Number(log.hours) || 0) * 60) : 0;
    return { key, log, minutes, working, stamp: stampOf(log, key, today, working) };
  });
  const verified = days.filter((day) => day.log?.status === "Verified").reduce((sum, day) => sum + day.minutes, 0);
  const total = days.reduce((sum, day) => sum + day.minutes, 0);
  const worked = days.filter((day) => day.log?.time_in).length;

  return (
    <section aria-labelledby="this-week" className="rounded-2xl bg-white p-3.5 ring-1 ring-inset ring-(--role-hairline) sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setBack((value) => value + 1)} aria-label="The week before" className="grid h-10 w-10 place-items-center rounded-full text-slate-600 hover:bg-psu-50">
            <Icon name="chevron-left" size={17} />
          </button>
          <h2 id="this-week" className="text-[16px] font-extrabold text-slate-900">
            {back === 0 ? "This week" : back === 1 ? "Last week" : `Week of ${formatPhDay(monday, { month: "short", day: "numeric" })}`}
          </h2>
          <button type="button" onClick={() => setBack((value) => Math.max(0, value - 1))} disabled={back === 0} aria-label="The week after" className="grid h-10 w-10 place-items-center rounded-full text-slate-600 hover:bg-psu-50 disabled:opacity-30">
            <Icon name="chevron-right" size={17} />
          </button>
        </div>
        <dl className="tabular flex gap-4 text-[13px]">
          <div>
            <dt className="text-slate-500">Hours</dt>
            <dd className="font-bold text-slate-900">{formatDuration(total)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Verified</dt>
            <dd className="font-bold text-(--status-success-ink)">{formatDuration(verified)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Days</dt>
            <dd className="font-bold text-slate-900">{worked} of 5</dd>
          </div>
        </dl>
      </div>

      {loading ? (
        <SkeletonRows rows={2} />
      ) : (
        <ol className="mt-3 grid grid-cols-5 gap-1.5 sm:gap-2">
          {days.map((day) => {
            const share = Math.min(1, day.minutes / (8 * 60));
            const label = `${formatPhDay(day.key, { weekday: "long", month: "long", day: "numeric" })}: ${day.stamp.word === "None" ? "no time-in" : day.stamp.word === "No out" ? "no time-out" : day.stamp.word}${day.minutes > 0 ? `, ${formatDuration(day.minutes)}` : ""}`;
            const inner = (
              <>
                <span className="text-[11.5px] font-bold uppercase text-slate-500">{formatPhDay(day.key, { weekday: "short" })}</span>
                <span className="font-display tabular text-[18px] font-extrabold leading-none text-slate-900">{formatPhDay(day.key, { day: "numeric" })}</span>
                <span title={day.stamp.word} className={`mt-1 inline-flex max-w-full items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-tight sm:text-[11px] ${day.stamp.className}`}>
                  <Icon name={day.stamp.icon} size={11} className="shrink-0" />
                  <span className="truncate max-sm:sr-only">{day.stamp.word}</span>
                </span>
                <span aria-hidden="true" className="mt-1.5 flex h-14 w-full items-end overflow-hidden rounded-lg bg-psu-50">
                  <span className={`block w-full rounded-lg ${day.working ? "bg-psu-600" : day.log?.status === "Verified" ? "bg-psu-400" : "bg-gold-300"}`} style={{ height: `${Math.round(share * 100)}%` }} />
                </span>
                <span className="tabular mt-1 text-[12px] font-bold text-slate-800">{day.minutes > 0 ? formatDuration(day.minutes) : "—"}</span>
                <span className="tabular hidden text-[11px] text-slate-500 sm:block">
                  {day.log?.time_in ? `${formatTime(day.log.time_in)}–${day.log.time_out ? formatTime(day.log.time_out) : "…"}` : " "}
                </span>
              </>
            );
            const box = `flex min-h-[9.5rem] w-full flex-col items-center rounded-xl px-1 py-2 text-center transition-colors ${day.key === today ? "ring-2 ring-psu-600" : "ring-1 ring-(--role-hairline)"}`;
            return (
              <li key={day.key}>
                {day.log ? (
                  <Link to={`/schedule?view=month&log=${day.log.id}`} aria-label={`${label}. Open the day`} className={`${box} hover:bg-psu-50`}>
                    {inner}
                  </Link>
                ) : (
                  <div aria-label={label} className={box}>
                    {inner}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-2 text-[11.5px] text-slate-500">Each bar is the day's hours against an 8-hour day. Tap a day to open it.</p>
    </section>
  );
}
