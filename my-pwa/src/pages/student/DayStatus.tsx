import { Link } from "react-router-dom";
import Icon from "../../components/Icon";
import { Button, Skeleton } from "../../components/ui";
import { formatDuration, formatHours, formatTime } from "../../lib/format";
import { toast } from "../../lib/toast";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { nextStep, OFFLINE_TIME_IN } from "./nextStep";
import { useTimeIn } from "./timeInContext";
import { workedMinutes } from "./useAttendance";

/*
|--------------------------------------------------------------------------
| WHERE TODAY STANDS
|--------------------------------------------------------------------------
|
| One line at the top of the Today page: not timed in, on the clock, on
| lunch, or done. The full card, with every step's time, is on the
| Attendance page; the step itself is taken from the header button on a
| wide screen and the floating button on a phone.
|
*/

/** The line for a finished day, by what the supervisor has decided. */
function doneText(hours: number | string | null, status: string): string {
  const rendered = `Done: ${formatHours(hours)} today`;
  if (status === "Verified") return `${rendered}, verified by your supervisor`;
  if (status === "Rejected" || status === "Flagged") return `${rendered}, rejected by your supervisor`;
  return `${rendered}, waiting for your supervisor`;
}

export default function DayStatus() {
  const { attendance, now } = useTimeIn();
  const { todayLog, stage, loading } = attendance;

  if (loading) return <Skeleton className="h-12 w-full rounded-xl" />;

  const waiting = todayLog?.waiting?.length ?? 0;
  const text =
    stage === "not-started" || !todayLog
      ? "Not timed in yet"
      : stage === "on-break"
        ? `Out for lunch since ${formatTime(todayLog.break_time)}`
        : stage === "done"
          ? doneText(todayLog.hours, todayLog.status)
          : `On the clock since ${formatTime(todayLog.time_in)}, ${formatDuration(workedMinutes(todayLog, now))}`;
  const active = stage === "working" || stage === "back" || stage === "on-break";

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
    >
      <span
        aria-hidden="true"
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
          stage === "done" ? "bg-emerald-500" : active ? "bg-gold-500" : "bg-slate-300"
        }`}
      />
      <p className="tabular min-w-0 flex-1 text-sm font-semibold text-slate-900">{text}</p>
      {waiting > 0 && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
          <Icon name="clock" size={14} className="shrink-0" />
          {waiting === 1 ? "1 step" : `${waiting} steps`} waiting to send
        </p>
      )}
      <Link
        to="/daily-log"
        className="inline-flex items-center gap-1 text-sm font-semibold text-psu-700 hover:underline"
      >
        Attendance
        <Icon name="chevron-right" size={14} />
      </Link>
    </div>
  );
}

/**
 * The next step as a button for a page header. Wide screens only: on a
 * phone the floating button does this.
 */
export function NextStepButton() {
  const timeIn = useTimeIn();
  const { stage, loading, busy } = timeIn.attendance;
  const step = loading ? null : nextStep(stage);
  const wide = useMediaQuery("(min-width: 768px)");
  if (!step || !wide) return null;
  const offline = stage === "not-started" && !timeIn.online;

  return (
    <Button
      variant="gold"
      icon={step.icon}
      disabled={busy}
      aria-label={step.name}
      // Looks unavailable but still answers a click, to say why.
      aria-disabled={offline || undefined}
      className={offline ? "opacity-60" : undefined}
      onClick={() => (offline ? toast.info(OFFLINE_TIME_IN) : step.run(timeIn))}
    >
      {step.label}
    </Button>
  );
}
