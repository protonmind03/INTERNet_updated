import { useEffect, useMemo, useRef, useState } from "react";
import DaySheet from "./DaySheet";
import Icon from "./Icon";
import type { PictureRole } from "../lib/attachments";
import { Card } from "./ui";
import { formatLongDate, phDateKey } from "../lib/format";
import {
  addDays,
  addMonths,
  calendarIndex,
  monthWeeksSunday,
  type CalendarAbsence,
  type CalendarHoliday,
  type CalendarLog,
  type CalendarShift,
  type ShiftPattern,
  type CalendarTask,
  type DayFacts,
  dayStatus,
  type DayStatus,
} from "../lib/studentCalendar";
import { formatPh, phCalendarDate } from "../lib/phTime";
import { useMediaQuery } from "../lib/useMediaQuery";

/*
|--------------------------------------------------------------------------
| THE MONTH, AS A CALENDAR
|--------------------------------------------------------------------------
|
| Iteration 21. Weeks run Sunday to Saturday (a two-week pattern is still
| looked up per date from its Monday anchor). Saturday and Sunday columns
| are tinted. A cell is the date and one status dot: verified, pending,
| late, absent or holiday; late is a dot, never a fill. Today has a ring and
| the chosen day is filled in the role's colour. On a phone the cells are
| at least 44 px square, with no words in them, and the grid runs nearly
| edge to edge so that holds at 320 px.
|
| A tap (or Enter; the arrow keys move from day to day) opens the day's
| sheet (components/DaySheet.tsx). The legend is one row of the five dots;
| on a phone it opens from a "Legend" chip.
|
| Everything comes from lists the page already holds (lib/studentCalendar.ts).
| The supervisor's intern page shows an intern's month with the same cells.
|
*/

type Reader = "student" | "staff";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Dot = "verified" | "pending" | "late" | "absent" | "holiday" | null;

const LEGEND: { dot: Exclude<Dot, null>; label: string }[] = [
  { dot: "verified", label: "Verified" },
  { dot: "pending", label: "Pending" },
  { dot: "late", label: "Late" },
  { dot: "absent", label: "Absent" },
  { dot: "holiday", label: "Holiday" },
];

function dotFor(status: DayStatus): Dot {
  if (status === "Holiday") return "holiday";
  if (status === "Late") return "late";
  if (status === "Verified") return "verified";
  if (status === "Pending") return "pending";
  if (status === "Absent" || status === "Morning absent" || status === "Rejected") return "absent";
  return null;
}

function monthName(month: string): string {
  const [year, index] = month.split("-").map(Number);
  return formatPh(phCalendarDate(year, index, 1), { month: "long", year: "numeric" });
}

export default function MonthCalendar({
  shifts,
  pattern,
  holidays,
  logs,
  absences,
  tasks,
  reader = "student",
  pictureRole,
  dayFooter,
  openDate,
}: {
  shifts: CalendarShift[];
  pattern?: ShiftPattern | null;
  holidays: CalendarHoliday[];
  logs: CalendarLog[];
  absences: CalendarAbsence[];
  tasks: CalendarTask[];
  /** Kept for callers; weeks of the OJT are no longer counted in the grid. */
  termStart?: string | null;
  reader?: Reader;
  pictureRole?: PictureRole;
  dayFooter?: (facts: DayFacts) => React.ReactNode;
  /** A day to open at once ("YYYY-MM-DD"), for a notification about it. */
  openDate?: string | null;
}) {
  const today = phDateKey(new Date());
  const phone = useMediaQuery("(max-width: 639px)");
  const [month, setMonth] = useState((openDate ?? today).slice(0, 7));
  const [opened, setOpened] = useState<string | null>(openDate ?? null);
  const [cursor, setCursor] = useState(openDate ?? today);
  const [legendOpen, setLegendOpen] = useState(false);
  const moved = useRef(false);

  // A day asked for after the logs arrived (a notification's ?log=).
  const [askedFor, setAskedFor] = useState(openDate ?? null);
  if (openDate && openDate !== askedFor) {
    setAskedFor(openDate);
    setMonth(openDate.slice(0, 7));
    setOpened(openDate);
    setCursor(openDate);
  }

  const dayOf = useMemo(() => calendarIndex({ shifts, pattern, holidays, logs, absences, tasks }), [shifts, pattern, holidays, logs, absences, tasks]);
  const weeks = useMemo(() => monthWeeksSunday(month), [month]);

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    document.getElementById(`day-${cursor}`)?.focus();
  }, [cursor, month]);

  const goTo = (date: string, focus: boolean) => {
    moved.current = focus;
    setCursor(date);
    if (date.slice(0, 7) !== month) setMonth(date.slice(0, 7));
  };
  const onKey = (event: React.KeyboardEvent) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    goTo(addDays(cursor, step), true);
  };
  const showMonth = (next: string) => {
    setMonth(next);
    setCursor(next === today.slice(0, 7) ? today : `${next}-01`);
  };

  const openedFacts = opened ? dayOf(opened) : null;

  const legend = (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-700">
      {LEGEND.map((item) => (
        <li key={item.dot} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`cal-dot cal-dot--${item.dot}`} />
          {item.label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-3 w-3 rounded-sm cal-weekend-swatch" />
        Weekend
      </li>
    </ul>
  );

  return (
    <Card className="p-3 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900" aria-live="polite">
          {monthName(month)}
        </h2>
        <div className="flex items-center gap-1">
          {month !== today.slice(0, 7) && (
            <button type="button" onClick={() => showMonth(today.slice(0, 7))} className="min-h-11 rounded-lg px-2.5 text-sm font-semibold text-psu-700 hover:bg-psu-50">
              This month
            </button>
          )}
          <button type="button" aria-label="Previous month" onClick={() => showMonth(addMonths(month, -1))} className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100">
            <Icon name="chevron-right" size={18} className="rotate-180" />
          </button>
          <button type="button" aria-label="Next month" onClick={() => showMonth(addMonths(month, 1))} className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100">
            <Icon name="chevron-right" size={18} />
          </button>
        </div>
      </div>

      <div role="grid" aria-label={`${monthName(month)}. Arrow keys move between days; Enter opens a day.`} onKeyDown={onKey} className="cal-grid mt-3">
        <div role="row" className="cal-row">
          {DAY_NAMES.map((name, index) => (
            <span key={name} role="columnheader" className={`cal-head ${index === 0 || index === 6 ? "cal-weekend" : ""}`}>
              {name}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} role="row" className="cal-row">
            {week.map((date, index) => {
              const facts = dayOf(date);
              const outside = date.slice(0, 7) !== month;
              const status = dayStatus(facts, today);
              const dot = dotFor(status);
              const selected = opened === date;
              return (
                <div key={date} role="gridcell" className={index === 0 || index === 6 ? "cal-weekend" : ""}>
                  <button
                    type="button"
                    id={`day-${date}`}
                    tabIndex={date === cursor ? 0 : -1}
                    aria-current={date === today ? "date" : undefined}
                    aria-pressed={selected}
                    onClick={() => {
                      goTo(date, false);
                      setOpened(date);
                    }}
                    onFocus={() => setCursor(date)}
                    className={`cal-cell ${date === today ? "cal-cell--today" : ""} ${selected ? "cal-cell--selected" : ""} ${outside ? "cal-cell--outside" : ""}`}
                  >
                    <span className="sr-only">
                      {formatLongDate(date)}: {status}
                      {facts.shift && !facts.holiday ? ", scheduled" : ""}
                      {facts.due.length > 0 ? `, ${facts.due.length} due` : ""}
                    </span>
                    <span aria-hidden="true" className="tabular cal-num">
                      {Number(date.slice(8))}
                    </span>
                    <span aria-hidden="true" className={`cal-dot ${dot ? `cal-dot--${dot}` : "cal-dot--none"}`} />
                    {!phone && facts.log?.hours !== null && facts.log?.hours !== undefined && facts.log.time_out && (
                      <span aria-hidden="true" className="tabular cal-hours">
                        {Number(facts.log.hours)} h
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-3">
        {phone ? (
          <>
            <button type="button" aria-expanded={legendOpen} aria-controls="cal-legend" onClick={() => setLegendOpen((open) => !open)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-slate-300 px-3 text-sm font-semibold text-slate-700">
              Legend
              <Icon name="chevron-right" size={14} className={legendOpen ? "rotate-90" : ""} />
            </button>
            {legendOpen && (
              <div id="cal-legend" className="mt-2">
                {legend}
              </div>
            )}
          </>
        ) : (
          legend
        )}
      </div>

      {openedFacts && (
        <DaySheet
          facts={openedFacts}
          today={today}
          pattern={pattern}
          reader={reader}
          pictureRole={pictureRole}
          onClose={() => setOpened(null)}
          onMove={(days) => {
            const next = addDays(openedFacts.date, days);
            goTo(next, false);
            setOpened(next);
          }}
          footer={dayFooter?.(openedFacts)}
        />
      )}
    </Card>
  );
}
