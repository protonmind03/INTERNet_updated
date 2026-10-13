import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { Card, Modal, StatusBadge } from "./ui";
import { formatHours, formatLongDate, formatTime, localDateKey } from "../lib/format";
import {
  addDays,
  addMonths,
  calendarIndex,
  countedFrom,
  hoursMark,
  mondayOf,
  monthWeeks,
  weekNumber,
  type CalendarAbsence,
  type CalendarHoliday,
  type CalendarLog,
  type CalendarShift,
  type CalendarTask,
  type DayFacts,
} from "../lib/studentCalendar";
import { STEP_LABELS } from "../lib/timeColumns";

/*
|--------------------------------------------------------------------------
| THE MONTH, AS A CALENDAR
|--------------------------------------------------------------------------
|
| One square per day: whether it is a working day, a holiday's name, a dot
| when a task is due, a mark when an absence was filed, and at the bottom
| the hours logged (or "open" for a day not yet timed out). A column on the
| left counts the weeks of the OJT.
|
| A tap on a day opens everything about it. Holding a day down does the
| same, and so does Enter; the arrow keys move from day to day.
|
| Everything comes from lists the page already holds, so the calendar asks
| the server for nothing (lib/studentCalendar.ts). The student's Schedule
| page shows their own month; a supervisor's intern page shows the
| intern's, with the same squares and the words turned round ("their").
|
*/

/** Whose month it is, from the reader's side. */
type Reader = "student" | "staff";

const WORDS: Record<Reader, { weekOf: string; before: string; did: string; worked: string; absenceWaiting: string; counted: string }> = {
  student: {
    weekOf: "Week of your OJT",
    before: "Before your OJT",
    did: "What I accomplished",
    worked: "Tasks I worked on",
    absenceWaiting: "Waiting for your supervisor",
    counted: "Weeks are counted from",
  },
  staff: {
    weekOf: "Week of the OJT",
    before: "Before the OJT",
    did: "What they accomplished",
    worked: "Tasks they worked on",
    absenceWaiting: "Waiting for a decision",
    counted: "Weeks are counted from",
  },
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "08:00:00" from the database becomes "8:00 AM". */
function clockText(time: string | null): string {
  if (!time) return "";
  const [hourText, minute = "00"] = time.split(":");
  const hour = Number(hourText);
  if (Number.isNaN(hour)) return time;
  return `${hour % 12 === 0 ? 12 : hour % 12}:${minute} ${hour >= 12 ? "PM" : "AM"}`;
}

const shiftText = (facts: DayFacts) =>
  facts.shift ? `${clockText(facts.shift.start_time)} to ${clockText(facts.shift.end_time)}` : "";

/** A day in a sentence, for a screen reader and for the sheet's first line. */
function describe(facts: DayFacts): string {
  const parts: string[] = [];
  if (facts.holiday) parts.push(`holiday, ${facts.holiday}`);
  else if (facts.shift) parts.push(`scheduled ${shiftText(facts)}`);
  else parts.push("day off");
  const mark = hoursMark(facts.log);
  if (mark) parts.push(mark.text === "open" ? "timed in, not yet timed out" : `${mark.text}${mark.verified ? " verified" : " logged"}`);
  if (facts.absence) parts.push("absence filed");
  if (facts.due.length > 0) parts.push(`${facts.due.length} due`);
  return parts.join("; ");
}

function monthName(month: string): string {
  const [year, index] = month.split("-").map(Number);
  return new Date(year, index - 1, 1).toLocaleDateString("en-PH", { month: "long", year: "numeric" });
}

export default function MonthCalendar({
  shifts,
  holidays,
  logs,
  absences,
  tasks,
  termStart,
  reader = "student",
  dayFooter,
}: {
  shifts: CalendarShift[];
  holidays: CalendarHoliday[];
  logs: CalendarLog[];
  absences: CalendarAbsence[];
  tasks: CalendarTask[];
  termStart: string | null;
  reader?: Reader;
  /** What goes under a day's details: a link onward, for instance. */
  dayFooter?: (facts: DayFacts) => React.ReactNode;
}) {
  const words = WORDS[reader];
  const today = localDateKey(new Date());

  const [month, setMonth] = useState(today.slice(0, 7));
  const [opened, setOpened] = useState<string | null>(null);
  // The day the arrow keys are on. Only that day is in the tab order.
  const [cursor, setCursor] = useState(today);
  const moved = useRef(false);

  const dayOf = useMemo(
    () => calendarIndex({ shifts, holidays, logs, absences, tasks }),
    [shifts, holidays, logs, absences, tasks]
  );
  const since = useMemo(() => countedFrom(logs, termStart), [logs, termStart]);
  const weeks = useMemo(() => monthWeeks(month), [month]);

  // After an arrow key, the focus follows the cursor (into another month if need be).
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    document.getElementById(`day-${cursor}`)?.focus();
  }, [cursor, month]);

  const move = (days: number) => {
    const next = addDays(cursor, days);
    moved.current = true;
    setCursor(next);
    if (next.slice(0, 7) !== month) setMonth(next.slice(0, 7));
  };
  const onKey = (event: React.KeyboardEvent) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    move(step);
  };
  const showMonth = (next: string) => {
    setMonth(next);
    // The cursor stays inside the month that is shown.
    setCursor(next === today.slice(0, 7) ? today : `${next}-01`);
  };

  // Holding a day down opens it too; a tap is the main way.
  const hold = useRef(0);
  const startHold = (date: string) => {
    window.clearTimeout(hold.current);
    hold.current = window.setTimeout(() => setOpened(date), 500);
  };
  const endHold = () => window.clearTimeout(hold.current);
  useEffect(() => () => window.clearTimeout(hold.current), []);

  const openedFacts = opened ? dayOf(opened) : null;

  return (
    <Card className="p-3 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900" aria-live="polite">
          {monthName(month)}
        </h2>
        <div className="flex items-center gap-1">
          {month !== today.slice(0, 7) && (
            <button
              type="button"
              onClick={() => showMonth(today.slice(0, 7))}
              className="h-9 rounded-lg px-2.5 text-sm font-semibold text-psu-700 hover:bg-psu-50"
            >
              This month
            </button>
          )}
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => showMonth(addMonths(month, -1))}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
          >
            <Icon name="chevron-right" size={18} className="rotate-180" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => showMonth(addMonths(month, 1))}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
          >
            <Icon name="chevron-right" size={18} />
          </button>
        </div>
      </div>

      <div
        role="grid"
        aria-label={`${monthName(month)}. Arrow keys move between days; Enter opens a day.`}
        onKeyDown={onKey}
        className="mt-3"
      >
        <div role="row" className="grid grid-cols-[1.75rem_repeat(7,minmax(0,1fr))] gap-1 text-center text-[11px] font-medium text-slate-600 sm:grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
          <span role="columnheader" aria-label={words.weekOf}>
            <span aria-hidden="true">Wk</span>
          </span>
          {DAY_NAMES.map((name) => (
            <span key={name} role="columnheader">
              {name}
            </span>
          ))}
        </div>

        {weeks.map((week) => {
          const number = weekNumber(week[0], since);
          return (
            <div
              key={week[0]}
              role="row"
              className="mt-1 grid grid-cols-[1.75rem_repeat(7,minmax(0,1fr))] gap-1 sm:grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]"
            >
              <span
                role="rowheader"
                className="flex items-center justify-center text-[11px] font-medium text-slate-600"
              >
                {number === null ? (
                  <span className="sr-only">{words.before}</span>
                ) : (
                  <>
                    <span className="hidden sm:inline">Week&nbsp;</span>
                    <span className="sr-only sm:hidden">Week </span>
                    {number}
                  </>
                )}
              </span>
              {week.map((date) => {
                const facts = dayOf(date);
                const outside = date.slice(0, 7) !== month;
                const working = Boolean(facts.shift) && !facts.holiday;
                const mark = hoursMark(facts.log);
                return (
                  <div key={date} role="gridcell">
                    <button
                      type="button"
                      id={`day-${date}`}
                      tabIndex={date === cursor ? 0 : -1}
                      aria-current={date === today ? "date" : undefined}
                      onClick={() => {
                        setCursor(date);
                        setOpened(date);
                      }}
                      onFocus={() => setCursor(date)}
                      onPointerDown={() => startHold(date)}
                      onPointerUp={endHold}
                      onPointerLeave={endHold}
                      onPointerCancel={endHold}
                      className={`relative flex h-16 w-full flex-col rounded-lg border p-1 text-left sm:h-24 sm:p-1.5 ${
                        date === today ? "border-psu-600 ring-1 ring-psu-600" : "border-slate-200"
                      } ${working ? "bg-white" : "bg-slate-100"} ${outside ? "border-dashed" : ""} hover:border-psu-400`}
                    >
                      {/* What a screen reader says for the day. The marks below are for the eye. */}
                      <span className="sr-only">
                        {formatLongDate(date)}: {describe(facts)}
                      </span>
                      <span className="flex items-start justify-between gap-0.5" aria-hidden="true">
                        <span
                          className={`tabular text-xs ${
                            date === today
                              ? "font-bold text-psu-800"
                              : outside
                                ? "font-medium text-slate-600"
                                : "font-semibold text-slate-900"
                          }`}
                        >
                          {Number(date.slice(8))}
                        </span>
                        <span className="flex items-center gap-0.5">
                          {facts.due.length > 0 && <span className="h-2 w-2 rounded-full bg-psu-600" />}
                          {facts.absence && (
                            <span className="rounded-sm bg-red-700 px-[3px] text-[9px] font-bold leading-3 text-white">
                              A
                            </span>
                          )}
                          {facts.holiday && (
                            <span className="rounded-sm bg-gold-400 px-[3px] text-[9px] font-bold leading-3 text-psu-950">
                              H
                            </span>
                          )}
                        </span>
                      </span>
                      <span
                        className="mt-0.5 hidden min-w-0 truncate text-[11px] leading-tight text-slate-600 sm:block"
                        aria-hidden="true"
                      >
                        {facts.holiday || (facts.shift ? clockText(facts.shift.start_time) : "Day off")}
                      </span>
                      {mark && (
                        <span
                          aria-hidden="true"
                          className={`tabular mt-auto text-[11px] font-semibold leading-none ${
                            mark.text === "open"
                              ? "text-amber-800"
                              : mark.verified
                                ? "text-emerald-800"
                                : "text-slate-700"
                          }`}
                        >
                          {mark.text}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-slate-300 bg-white" aria-hidden="true" />
          Working day
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-slate-300 bg-slate-100" aria-hidden="true" />
          Day off
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-dashed border-slate-400 bg-white" aria-hidden="true" />
          Another month
        </li>
        <li className="flex items-center gap-1.5">
          <span className="rounded-sm bg-gold-400 px-[3px] text-[9px] font-bold leading-3 text-psu-950" aria-hidden="true">
            H
          </span>
          Holiday
        </li>
        <li className="flex items-center gap-1.5">
          <span className="rounded-sm bg-red-700 px-[3px] text-[9px] font-bold leading-3 text-white" aria-hidden="true">
            A
          </span>
          Absence filed
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-psu-600" aria-hidden="true" />
          Task or requirement due
        </li>
        <li>
          <span className="font-semibold text-emerald-800">8 h</span> verified hours ·{" "}
          <span className="font-semibold text-slate-700">8 h</span> not yet verified ·{" "}
          <span className="font-semibold text-amber-800">open</span> not timed out
        </li>
      </ul>
      <p className="mt-1.5 text-xs text-slate-600">
        Tap a day for its details.
        {since ? ` ${words.counted} ${formatLongDate(mondayOf(since))}.` : ""}
      </p>

      <Modal
        open={Boolean(openedFacts)}
        onClose={() => setOpened(null)}
        title={openedFacts ? formatLongDate(openedFacts.date) : ""}
        description={
          openedFacts
            ? [
                weekNumber(openedFacts.date, since) !== null ? `Week ${weekNumber(openedFacts.date, since)}` : "",
                openedFacts.date === today ? "Today" : "",
              ]
                .filter(Boolean)
                .join(" · ") || undefined
            : undefined
        }
      >
        {openedFacts && (
          <DayDetails facts={openedFacts} future={openedFacts.date > today} reader={reader}>
            {dayFooter?.(openedFacts)}
          </DayDetails>
        )}
      </Modal>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-sm text-slate-600">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

/** Everything about one day: the sheet a tap opens. */
function DayDetails({
  facts,
  future,
  reader,
  children,
}: {
  facts: DayFacts;
  future: boolean;
  reader: Reader;
  children?: React.ReactNode;
}) {
  const { log } = facts;
  const words = WORDS[reader];
  return (
    <div className="space-y-4">
      <dl className="divide-y divide-slate-100">
        <Row label="Shift">
          {facts.holiday ? (
            <>
              Holiday: {facts.holiday}
              {facts.shift && (
                <span className="block text-xs font-normal text-slate-600">Usually {shiftText(facts)}</span>
              )}
            </>
          ) : facts.shift ? (
            <>
              {shiftText(facts)}
              <span className="block text-xs font-normal text-slate-600">
                {formatHours(facts.shift.hours)}
                {facts.shift.focus ? ` · ${facts.shift.focus}` : ""}
              </span>
            </>
          ) : (
            "Day off"
          )}
        </Row>
        {log ? (
          <>
            <Row label={STEP_LABELS.time_in}>{formatTime(log.time_in)}</Row>
            <Row label={STEP_LABELS.break_time}>{log.break_time ? formatTime(log.break_time) : "Not taken"}</Row>
            <Row label={STEP_LABELS.break_end_time}>
              {log.break_end_time ? formatTime(log.break_end_time) : log.break_time ? "Not yet" : "Not taken"}
            </Row>
            <Row label={STEP_LABELS.time_out}>{log.time_out ? formatTime(log.time_out) : "Not yet"}</Row>
            <Row label="Hours">{log.time_out ? formatHours(log.hours) : "Still open"}</Row>
            <Row label="Status">
              <StatusBadge status={log.status} />
            </Row>
          </>
        ) : (
          <Row label="Attendance">
            {future ? "Not yet" : facts.absence ? "Absent" : "No time-in recorded"}
          </Row>
        )}
        {facts.absence && (
          <Row label="Absence filed">
            {facts.absence.status === "Pending" ? words.absenceWaiting : facts.absence.status}
            {facts.absence.reason && (
              <span className="block text-xs font-normal text-slate-600">{facts.absence.reason}</span>
            )}
          </Row>
        )}
      </dl>

      {log?.accomplishments && (
        <div>
          <p className="text-xs font-medium text-slate-600">{words.did}</p>
          <p className="mt-0.5 whitespace-pre-line break-words text-sm text-slate-800">{log.accomplishments}</p>
        </div>
      )}
      {log?.tasks && log.tasks.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-600">{words.worked}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-800">
            {log.tasks.map((task) => (
              <li key={task.id} className="break-words">
                {task.title}
              </li>
            ))}
          </ul>
        </div>
      )}
      {facts.due.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-600">Due this day</p>
          <ul className="mt-1 space-y-1 text-sm text-slate-800">
            {facts.due.map((task) => (
              <li key={task.id} className="flex items-start justify-between gap-3">
                <span className="min-w-0 break-words">{task.title}</span>
                <span className="shrink-0 text-xs text-slate-600">{task.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {children}
    </div>
  );
}
