import { formatDayDate } from "../lib/format";
import { REPORT_PARTS, accomplishmentsOf, type DayLog, type ReportText } from "../lib/weeklyReport";

/*
|--------------------------------------------------------------------------
| THE WEEKLY REPORT, AS IT IS READ
|--------------------------------------------------------------------------
|
| What a student writes once a week, in four parts, and beside it what they
| wrote at each time-out that week. The same two pieces are shown to the
| student, their supervisor and the coordinator, with the same headings, so
| all three are looking at the same report.
|
*/

/** The parts that were written. An older report simply has fewer. */
export function ReportParts({ report }: { report: ReportText }) {
  return (
    <>
      {REPORT_PARTS.map((part) => {
        const written = report[part.key];
        if (!written) return null;
        return (
          <div key={part.key}>
            <p className="text-xs font-medium text-slate-600">{part.label}</p>
            <p className="mt-0.5 whitespace-pre-line break-words text-sm text-slate-800">{written}</p>
          </div>
        );
      })}
    </>
  );
}

/**
 * What the student wrote at time-out on each day of the week: read-only,
 * one line per day. It is there to write the report from, and to read the
 * report against.
 */
export function DailyAccomplishments({ weekStart, logs }: { weekStart: string; logs: DayLog[] }) {
  const days = accomplishmentsOf(weekStart, logs);
  return (
    <section aria-label="Daily accomplishments this week" className="rounded-lg bg-slate-100 px-3 py-2.5">
      <p className="text-xs font-semibold text-slate-700">Daily accomplishments this week</p>
      {days.length === 0 ? (
        <p className="mt-1 text-sm text-slate-600">
          No accomplishment was written at time-out on any day of this week.
        </p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {days.map((day) => (
            <li key={day.date} className="text-sm text-slate-800">
              <span className="font-medium text-slate-900">{formatDayDate(day.date)}:</span>{" "}
              <span className="whitespace-pre-line break-words">{day.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
