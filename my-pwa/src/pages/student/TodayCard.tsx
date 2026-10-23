import { Link } from "react-router-dom";
import { PunchRow, Stamp, TearLine } from "../../brand/motifs";
import Icon from "../../components/Icon";
import { Button, Skeleton } from "../../components/ui";
import { formatDuration, formatHours, formatTime } from "../../lib/format";
import { STEP_NAMES } from "./nextStep";
import { useTimeIn } from "./timeInContext";
import { workedMinutes, type AttendanceLog } from "./useAttendance";

/*
|--------------------------------------------------------------------------
| TODAY'S TIME CARD (PSU redesign, 7A and 13, the trainee's motif)
|--------------------------------------------------------------------------
|
| The day as a punched card: what is happening and since when, the time
| worked in big figures, a stamp ("On time", "Late 12 min", or how the
| supervisor decided a finished day), a tear line, then the punch row (In,
| Lunch, Back, Out) with "--:--" for a step not done. Under it the step
| buttons: the gold one is the thing to do now (Time in, End break, Time
| out); the other choice is outlined (Lunch break while working, Time out
| during lunch, as the old Attendance tiles allowed). It reads the shared attendance
| (TimeInProvider) and opens the same dialogs as every other way in, so the
| camera check, passkeys and offline steps work exactly as before.
|
*/

/** "07:58": a punched time, Philippine time, 24-hour like a time clock. */
function punch(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-PH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Manila" }).format(date);
}

function stampFor(log: AttendanceLog | undefined) {
  if (!log?.time_in) return null;
  if (log.time_out) {
    if (log.status === "Verified") return <Stamp tone="good">Verified</Stamp>;
    if (log.status === "Rejected" || log.status === "Flagged") return <Stamp tone="bad">Rejected</Stamp>;
    return <Stamp tone="info">Pending</Stamp>;
  }
  if (log.late_minutes === null || log.late_minutes === undefined) return null;
  return log.late_minutes > 0 ? <Stamp tone="bad">Late {log.late_minutes} min</Stamp> : <Stamp tone="good">On time</Stamp>;
}

export default function TodayCard({ large = false }: { large?: boolean }) {
  const timeIn = useTimeIn();
  const { attendance, now } = timeIn;
  const { todayLog: log, stage, loading, busy, today } = attendance;

  if (loading) {
    return (
      <section className="time-card p-4" aria-label="Today's time card">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-10 w-36" />
        <Skeleton className="mt-6 h-12 w-full" />
        <Skeleton className="mt-4 h-12 w-full" />
      </section>
    );
  }

  const amOnly = log?.session === "am" || today?.kind === "am";
  const punches = amOnly
    ? [
        { label: "In", time: punch(log?.time_in) },
        { label: "Out", time: punch(log?.time_out) },
      ]
    : [
        { label: "In", time: punch(log?.time_in) },
        { label: "Lunch", time: punch(log?.break_time) },
        { label: "Back", time: punch(log?.break_end_time) },
        { label: "Out", time: punch(log?.time_out) },
      ];

  let eyebrow: string;
  let big: string;
  if (!log?.time_in || stage === "not-started") {
    eyebrow = today?.kind === "holiday" ? `Holiday${today.holiday ? `: ${today.holiday}` : ""}` : "Not timed in yet";
    big = today?.opensAt && Date.parse(today.opensAt) > now.getTime() ? `Opens ${formatTime(today.opensAt)}` : "Time in when you arrive";
  } else if (stage === "on-break") {
    eyebrow = `On lunch since ${formatTime(log.break_time)}`;
    big = formatDuration(workedMinutes(log, now));
  } else if (stage === "done") {
    eyebrow = `Timed out at ${formatTime(log.time_out)}`;
    big = formatHours(log.hours);
  } else {
    eyebrow = `Working since ${formatTime(log.time_in)}`;
    big = formatDuration(workedMinutes(log, now));
  }
  const waiting = log?.waiting?.length ?? 0;
  // Before the time-in opens (30 minutes before the shift), the server would refuse it.
  const notOpen = stage === "not-started" && Boolean(today?.opensAt) && Date.parse(String(today?.opensAt)) > now.getTime();

  return (
    <section className={`time-card ${large ? "md:p-2" : ""}`} aria-label="Today's time card">
      <div className="relative px-4 pb-4 pt-4">
        <p className="eyebrow text-(--role-ink)/80" role="status">
          {eyebrow}
        </p>
        <p className={`font-display tabular mt-1 font-extrabold leading-none text-(--role-chrome) ${large ? "text-[44px] md:text-[56px]" : "text-[38px]"} ${stage === "not-started" ? "text-[26px]! leading-tight" : ""}`}>
          {big}
        </p>
        {waiting > 0 && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-(--status-info-ink)">
            <Icon name="clock" size={14} />
            {waiting === 1 ? "1 step" : `${waiting} steps`} waiting to send
          </p>
        )}
        <span className="absolute right-4 top-4">{stampFor(log)}</span>
      </div>
      <TearLine />
      <PunchRow punches={punches} />
      <div className="flex gap-2.5 px-3 pb-3 pt-1">
        {stage === "not-started" && (
          <Button variant="gold" size="lg" block icon="camera" disabled={busy || notOpen} onClick={() => timeIn.openTimeIn()}>
            {STEP_NAMES.timeIn}
          </Button>
        )}
        {stage === "working" && (
          <>
            {!amOnly && (
              <Button variant="outline" size="lg" className="flex-1" disabled={busy} onClick={() => timeIn.openStep("break")}>
                {STEP_NAMES.lunch}
              </Button>
            )}
            <Button variant="gold" size="lg" className="flex-1" icon="clock" disabled={busy} onClick={() => timeIn.openStep("out")} data-focus="time-out">
              {STEP_NAMES.timeOut}
            </Button>
          </>
        )}
        {stage === "on-break" && (
          // Back from lunch is the usual next step; leaving during lunch stays possible, as before.
          <>
            <Button variant="gold" size="lg" className="flex-1" disabled={busy} onClick={() => timeIn.openStep("back")}>
              {STEP_NAMES.endBreak}
            </Button>
            <Button variant="outline" size="lg" className="flex-1" icon="clock" disabled={busy} onClick={() => timeIn.openStep("out")} data-focus="time-out">
              {STEP_NAMES.timeOut}
            </Button>
          </>
        )}
        {stage === "back" && (
          <Button variant="gold" size="lg" block icon="clock" disabled={busy} onClick={() => timeIn.openStep("out")} data-focus="time-out">
            {STEP_NAMES.timeOut}
          </Button>
        )}
        {stage === "done" && (
          <Link to="/daily-log" className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg text-sm font-bold text-(--role-primary) hover:bg-psu-50">
            See the day in Attendance
            <Icon name="chevron-right" size={16} />
          </Link>
        )}
      </div>
    </section>
  );
}
