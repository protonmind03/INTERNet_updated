import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, ConfirmDialog } from "../../components/ui";
import Icon from "../../components/Icon";
import { API_URL, withStudentAuth } from "../../lib/api";
import { formatDateTime, formatTime } from "../../lib/format";
import {
  discardWaitingStep,
  LOCAL_LOG_ID,
  QUEUE_CHANGED,
  QUEUE_TRIED,
  retryWaitingSteps,
  waitingRows,
  type QueuedKind,
  type QueuedStep,
} from "../../lib/offlineQueue";
import { useReachability } from "../../lib/reachability";
import { errorText, toast } from "../../lib/toast";

/*
|--------------------------------------------------------------------------
| WAITING TO SEND
|--------------------------------------------------------------------------
|
| Iteration 12. The attendance steps kept on this phone because there was
| no connection (lib/offlineQueue.ts), one row each: when it was recorded,
| until when the server will still take it (OFFLINE_MAX_AGE_HOURS_* on the
| server, GET /api/offline/limits), how the last try went, and two buttons:
| Retry sends now, Discard throws one away after asking.
|
| Shown on every student page while anything is waiting; gone otherwise.
|
*/

type Limits = { time_in: number; lunch: number; time_out: number };

/** The server's defaults, used until it has said otherwise. */
const DEFAULT_LIMITS: Limits = { time_in: 12, lunch: 12, time_out: 24 };
const LIMITS_KEY = "internet-offline-limits";

const NAMES: Record<QueuedKind, string> = {
  "time-in": "Time-in",
  break: "Out for lunch",
  "break-end": "Back from lunch",
  "time-out": "Time-out",
  pictures: "Pictures for the time-out",
};

/** How it is named in a sentence: "this time-out", "these pictures". */
const thisOne = (path: QueuedKind) => (path === "pictures" ? "these pictures" : `this ${NAMES[path].toLowerCase()}`);

// A time-out's pictures are held to the time-out's limit.
function limitFor(path: QueuedKind, limits: Limits): number {
  return path === "time-in" ? limits.time_in : path === "time-out" || path === "pictures" ? limits.time_out : limits.lunch;
}

function savedLimits(): Limits {
  try {
    const saved = JSON.parse(localStorage.getItem(LIMITS_KEY) || "null") as Partial<Limits> | null;
    if (saved && [saved.time_in, saved.lunch, saved.time_out].every((value) => typeof value === "number" && value > 0)) {
      return saved as Limits;
    }
  } catch {
    // Storage blocked: the defaults will do.
  }
  return DEFAULT_LIMITS;
}

/** "2 h 5 min", "40 min", "less than a minute". */
function span(ms: number): string {
  const minutes = Math.floor(Math.abs(ms) / 60_000);
  if (minutes < 1) return "less than a minute";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export default function WaitingToSend() {
  const [rows, setRows] = useState<{ id: number; step: QueuedStep }[]>([]);
  const [limits, setLimits] = useState<Limits>(savedLimits);
  const [sending, setSending] = useState(false);
  const [discarding, setDiscarding] = useState<{ id: number; step: QueuedStep } | null>(null);
  const [busyDiscard, setBusyDiscard] = useState(false);
  // Ticks once a minute so "ago" and "left" stay right.
  const [now, setNow] = useState(() => Date.now());
  const { reachable, checkedAt } = useReachability();

  const read = useCallback(() => {
    void waitingRows().then(setRows);
  }, []);

  useEffect(() => {
    read();
    window.addEventListener(QUEUE_CHANGED, read);
    window.addEventListener(QUEUE_TRIED, read);
    const tick = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      window.removeEventListener(QUEUE_CHANGED, read);
      window.removeEventListener(QUEUE_TRIED, read);
      window.clearInterval(tick);
    };
  }, [read]);

  // The server's own limits, when it can be asked; kept for the next time it cannot.
  const waiting = rows.length > 0;
  useEffect(() => {
    if (!waiting || reachable !== true) return;
    let current = true;
    void fetch(`${API_URL}/api/offline/limits`, withStudentAuth())
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { hours?: Partial<Limits> } | null) => {
        const hours = data?.hours;
        if (!current || !hours) return;
        const next = { ...DEFAULT_LIMITS, ...hours } as Limits;
        setLimits(next);
        try {
          localStorage.setItem(LIMITS_KEY, JSON.stringify(next));
        } catch {
          // Storage blocked: asked again next time.
        }
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [waiting, reachable]);

  if (!waiting) return null;

  const retry = async () => {
    setSending(true);
    try {
      await retryWaitingSteps();
    } finally {
      setSending(false);
      read();
    }
  };

  const behind = discarding?.step.path === "time-in"
    ? rows.filter((row) => row.id !== discarding.id && row.step.logId === LOCAL_LOG_ID && row.step.path !== "pictures").length
    : 0;
  // A time-out's pictures go with it (and a time-in's, through its time-out).
  const goingPictures = discarding
    ? rows
        .filter(
          (row) =>
            row.step.path === "pictures" &&
            row.id !== discarding.id &&
            (row.step.forRequest === discarding.step.requestId ||
              (discarding.step.path === "time-in" && row.step.logId === LOCAL_LOG_ID))
        )
        .reduce((sum, row) => sum + (row.step.pictures?.length ?? 0), 0)
    : 0;

  const discard = async () => {
    if (!discarding) return;
    setBusyDiscard(true);
    try {
      const gone = await discardWaitingStep(discarding.id);
      toast.success(gone > 1 ? `${gone} steps were discarded.` : `${NAMES[discarding.step.path]} discarded.`);
      setDiscarding(null);
    } catch (discardError) {
      toast.error(errorText(discardError, "It could not be discarded."));
    } finally {
      setBusyDiscard(false);
      read();
    }
  };

  const server =
    reachable === null
      ? "Checking whether the server can be reached…"
      : reachable
        ? "The server can be reached. They are being sent."
        : `The server cannot be reached${checkedAt ? ` (checked ${formatTime(checkedAt)})` : ""}. They are sent by themselves once it can.`;

  return (
    <section
      aria-labelledby="waiting-to-send-title"
      className="mb-5 rounded-xl border border-gold-300 bg-gold-50 p-4 shadow-card sm:p-5"
      data-testid="waiting-to-send"
    >
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="waiting-to-send-title" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Icon name="clock" size={16} className="shrink-0 text-psu-700" />
              Waiting to send ({rows.length})
            </h2>
            <p className="mt-1 text-sm text-slate-700">
              Recorded on this phone without a connection. Keep the app installed and do not sign out until they are sent.{" "}
              <Link to="/help#offline" className="font-medium text-psu-700 underline underline-offset-2">
                How this works
              </Link>
            </p>
            <p className="mt-1 text-sm text-slate-600" role="status" aria-live="polite">
              {server}
            </p>
          </div>
          <Button variant="secondary" size="sm" icon="refresh" onClick={() => void retry()} busy={sending} busyProcess="attendance" busyLabel="Sending">
            Retry now
          </Button>
        </div>

        <ul className="mt-3 divide-y divide-gold-200 rounded-xl border border-gold-200 bg-white">
          {rows.map((row) => {
            const { step } = row;
            const recorded = new Date(step.occurredAt).getTime();
            const hours = limitFor(step.path, limits);
            const until = recorded + hours * 60 * 60 * 1000;
            const expired = until <= now;
            return (
              <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 p-3" data-testid="waiting-step">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-slate-900">
                    {NAMES[step.path]}
                    {step.path === "pictures" && ` (${step.pictures?.length ?? 0})`}
                  </p>
                  <p className="text-slate-700">
                    Recorded {formatDateTime(step.occurredAt)} ({span(now - recorded)} ago)
                  </p>
                  {expired ? (
                    <p className="font-medium text-red-700">
                      Too old to be added: the limit is {hours} hours. Discard it and tell your supervisor what time it really was.
                    </p>
                  ) : (
                    <p className="text-slate-700">
                      Can be sent until {formatDateTime(new Date(until))} ({span(until - now)} left)
                    </p>
                  )}
                  {step.lastError && (
                    <p className="text-slate-600">
                      Tried {step.attempts ?? 1} {step.attempts === 1 || !step.attempts ? "time" : "times"}
                      {step.lastTriedAt ? `, last at ${formatTime(step.lastTriedAt)}` : ""}: {step.lastError}
                    </p>
                  )}
                </div>
                <Button variant="ghost" size="sm" icon="trash" onClick={() => setDiscarding(row)} aria-label={`Discard ${NAMES[step.path].toLowerCase()} recorded ${formatDateTime(step.occurredAt)}`}>
                  Discard
                </Button>
              </li>
            );
          })}
        </ul>
      </div>

      <ConfirmDialog
        open={discarding !== null}
        title={discarding ? `Discard ${thisOne(discarding.step.path)}?` : "Discard?"}
        message={
          discarding?.step.path === "pictures"
            ? `They were chosen for the time-out at ${formatDateTime(discarding.step.occurredAt)} and have not reached the server. Once discarded they cannot be brought back from this phone. The time-out itself is kept.`
            : discarding
            ? `It was recorded at ${formatDateTime(discarding.step.occurredAt)} and has not reached the server. Once discarded it cannot be brought back; tell your supervisor what time it really was.${
                behind > 0 ? ` The ${behind === 1 ? "step" : `${behind} steps`} recorded after it ${behind === 1 ? "goes" : "go"} too, because ${behind === 1 ? "it belongs" : "they belong"} to this day's time-in.` : ""
              }${goingPictures > 0 ? ` ${goingPictures === 1 ? "The picture" : `The ${goingPictures} pictures`} chosen for the time-out ${goingPictures === 1 ? "goes" : "go"} too.` : ""}`
            : undefined
        }
        confirmLabel="Discard"
        tone="danger"
        busy={busyDiscard}
        onConfirm={() => void discard()}
        onCancel={() => setDiscarding(null)}
      />
    </section>
  );
}
