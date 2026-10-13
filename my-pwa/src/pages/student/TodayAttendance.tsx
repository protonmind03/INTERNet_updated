import Icon, { type IconName } from "../../components/Icon";
import { Button, Skeleton, StatusBadge } from "../../components/ui";
import { formatDuration, formatHours, formatLongDate, formatTime } from "../../lib/format";
import { useTimeIn } from "./timeInContext";
import { workedMinutes } from "./useAttendance";

/*
|--------------------------------------------------------------------------
| TODAY'S ATTENDANCE
|--------------------------------------------------------------------------
|
| The one card a student uses every day. It always shows the next step:
| time in, start break, back to work, time out. A break is optional, so
| "Time out" is available as soon as the student has timed in.
|
| The dialogs its buttons open, and the day's attendance itself, are held
| by TimeInProvider, shared with the other places a step can be taken.
|
*/

const STEPS = [
  { key: "time_in", label: "Time in", icon: "play" },
  { key: "break_time", label: "Out for lunch", icon: "coffee" },
  { key: "break_end_time", label: "Back from lunch", icon: "arrow-right" },
  { key: "time_out", label: "Time out", icon: "stop" },
] as const satisfies readonly { key: string; label: string; icon: IconName }[];

export default function TodayAttendance() {
  const { attendance, now, online, openTimeIn, openStep } = useTimeIn();
  const { todayLog, stage, loading, busy } = attendance;

  const headline = {
    "not-started": "You haven't timed in yet",
    working: "You're on the clock",
    "on-break": "You're out for lunch",
    back: "You're on the clock",
    done: "You're done for today",
  }[stage];

  const worked = todayLog ? workedMinutes(todayLog, now) : 0;

  return (
    <section className="surface-brand relative overflow-hidden rounded-2xl text-white shadow-raised">
      {/* Concentric rings, after the university seal. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 600 600"
        className="pointer-events-none absolute -right-28 -top-36 w-[26rem] text-white/[0.05]"
        fill="none"
        stroke="currentColor"
      >
        <circle cx="300" cy="300" r="296" strokeWidth="2" />
        <circle cx="300" cy="300" r="236" strokeWidth="28" />
        <circle cx="300" cy="300" r="170" strokeWidth="2" />
      </svg>
      <div className="relative px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-psu-200">{formatLongDate(now)}</p>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-56 bg-white/15" />
            ) : (
              <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
                {headline}
              </h2>
            )}
          </div>
          <p className="tabular shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold ring-1 ring-inset ring-white/15">
            {formatTime(now)}
          </p>
        </div>

        {!loading && stage !== "not-started" && todayLog && (
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <p className="text-sm text-psu-100">
              <span className="text-3xl font-bold text-white">
                {stage === "done" && todayLog.hours !== null
                  ? formatHours(todayLog.hours)
                  : formatDuration(worked)}
              </span>{" "}
              {stage === "done" ? "rendered" : "worked so far"}
            </p>
            {stage === "done" && <StatusBadge status={todayLog.status} />}
          </div>
        )}

        {!loading && todayLog?.waiting && todayLog.waiting.length > 0 && (
          <p role="status" className="mt-3 flex items-start gap-2 text-sm text-gold-200">
            <Icon name="clock" size={16} className="mt-0.5 shrink-0" />
            <span>
              {todayLog.waiting.length === 1 ? "1 step is" : `${todayLog.waiting.length} steps are`}{" "}
              saved on this phone and will be sent when you're back online. Keep the app
              signed in until then.
            </span>
          </p>
        )}

        {!loading && stage === "not-started" && online && (
          <p className="mt-2 max-w-md text-sm text-psu-100">
            Time in from your workplace. A quick camera check takes your photo,
            and your supervisor uses it to verify the day.
          </p>
        )}

        {/* The camera check is set and confirmed by the server, so with no
            connection the time-in is recorded without a photo instead. */}
        {!loading && stage === "not-started" && !online && (
          <p role="status" className="mt-2 max-w-md text-sm text-gold-200">
            There is no connection, so the camera check cannot run. You can still time in
            without a photo: it is kept on this phone, sent when you are back online, and your
            supervisor has to confirm it.
          </p>
        )}

        {/* ACTIONS */}
        {!loading && (
          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
            {stage === "not-started" && (
              <Button
                variant="gold"
                size="lg"
                icon={online ? "camera" : "clock"}
                onClick={openTimeIn}
              >
                {online ? "Time in" : "Time in without a photo"}
              </Button>
            )}
            {stage === "working" && (
              <>
                <Button
                  variant="gold"
                  size="lg"
                  icon="coffee"
                  disabled={busy}
                  onClick={() => openStep("break")}
                >
                  Out for lunch
                </Button>
                <OutlineButton disabled={busy} onClick={() => openStep("out")}>
                  Time out
                </OutlineButton>
              </>
            )}
            {stage === "on-break" && (
              <>
                <Button
                  variant="gold"
                  size="lg"
                  icon="arrow-right"
                  disabled={busy}
                  onClick={() => openStep("back")}
                >
                  Back from lunch
                </Button>
                <OutlineButton disabled={busy} onClick={() => openStep("out")}>
                  Time out
                </OutlineButton>
              </>
            )}
            {stage === "back" && (
              <Button
                variant="gold"
                size="lg"
                icon="stop"
                disabled={busy}
                onClick={() => openStep("out")}
              >
                Time out
              </Button>
            )}
          </div>
        )}
      </div>

      {/* STEP TIMES */}
      <ol className="relative grid grid-cols-4 divide-x divide-white/10 border-t border-white/10 bg-psu-950/40">
        {STEPS.map((step) => {
          const value = todayLog?.[step.key] ?? null;
          return (
            <li key={step.key} className="px-2 py-3 text-center sm:px-4">
              <p className="flex items-center justify-center gap-1.5 text-xs text-psu-200">
                {/* A gold dot marks each step already recorded today. */}
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${
                    value ? "bg-gold-400" : "bg-white/20"
                  }`}
                />
                {step.label}
              </p>
              <p
                className={`tabular mt-0.5 text-sm font-semibold ${
                  value ? "text-white" : "text-psu-300"
                }`}
              >
                {loading ? "…" : formatTime(value)}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function OutlineButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="inline-flex h-12 items-center justify-center rounded-lg border border-white/30 px-5 text-base font-semibold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
      {...rest}
    >
      {children}
    </button>
  );
}
