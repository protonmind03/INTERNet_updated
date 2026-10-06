import { useEffect, useState } from "react";
import { BrandLoader } from "../../brand";
import Icon, { type IconName } from "../../components/Icon";
import LivenessCamera, { type LivenessReport } from "../../components/LivenessCamera";
import {
  Button,
  ConfirmDialog,
  FormError,
  Modal,
  Skeleton,
  StatusBadge,
} from "../../components/ui";
import { formatDuration, formatHours, formatLongDate, formatTime } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import {
  workedMinutes,
  type AttendanceController,
  type LivenessChallenge,
} from "./useAttendance";

/*
|--------------------------------------------------------------------------
| TODAY'S ATTENDANCE
|--------------------------------------------------------------------------
|
| The one card a student uses every day. It always shows the next step:
| time in, start break, back to work, time out. A break is optional, so
| "Time out" is available as soon as the student has timed in.
|
*/

type Pending = "break" | "back" | "out" | null;

const STEPS = [
  { key: "time_in", label: "Time in", icon: "play" },
  { key: "break_time", label: "Break", icon: "coffee" },
  { key: "break_end_time", label: "Back", icon: "arrow-right" },
  { key: "time_out", label: "Time out", icon: "stop" },
] as const satisfies readonly { key: string; label: string; icon: IconName }[];

export default function TodayAttendance({
  attendance,
}: {
  attendance: AttendanceController;
}) {
  const { todayLog, stage, loading, busy } = attendance;

  const [now, setNow] = useState(() => new Date());
  const [timeInOpen, setTimeInOpen] = useState(false);
  const [pending, setPending] = useState<Pending>(null);

  // The clock shows hours and minutes, so it only needs to move when the
  // minute does; a seconds counter was the one thing on this page that
  // never stopped moving.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const confirm = async () => {
    const action = pending;
    if (!action) return;
    try {
      if (action === "break") {
        await attendance.startBreak();
        toast.success("Break started.");
      } else if (action === "back") {
        await attendance.endBreak();
        toast.success("Welcome back. Your break has ended.");
      } else {
        await attendance.timeOut();
        toast.celebrate("Time-out recorded. Your supervisor will verify today's log.");
      }
      setPending(null);
    } catch (error) {
      toast.error(errorText(error, "That didn't go through. Please try again."));
    }
  };

  const headline = {
    "not-started": "You haven't timed in yet",
    working: "You're on the clock",
    "on-break": "You're on break",
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

        {!loading && stage === "not-started" && (
          <p className="mt-2 max-w-md text-sm text-psu-100">
            Time in from your workplace. A quick camera check takes your photo,
            and your supervisor uses it to verify the day.
          </p>
        )}

        {/* ACTIONS */}
        {!loading && (
          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
            {stage === "not-started" && (
              <Button
                variant="gold"
                size="lg"
                icon="camera"
                onClick={() => setTimeInOpen(true)}
              >
                Time in
              </Button>
            )}
            {stage === "working" && (
              <>
                <Button
                  variant="gold"
                  size="lg"
                  icon="coffee"
                  disabled={busy}
                  onClick={() => setPending("break")}
                >
                  Start break
                </Button>
                <OutlineButton disabled={busy} onClick={() => setPending("out")}>
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
                  onClick={() => setPending("back")}
                >
                  Back to work
                </Button>
                <OutlineButton disabled={busy} onClick={() => setPending("out")}>
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
                onClick={() => setPending("out")}
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

      <TimeInDialog
        open={timeInOpen}
        now={now}
        onClose={() => setTimeInOpen(false)}
        loadChallenge={attendance.livenessChallenge}
        onSubmit={attendance.timeIn}
      />

      <ConfirmDialog
        open={pending === "break"}
        title="Start your break?"
        message={`Your break will start at ${formatTime(now)}. It is not counted in your rendered hours.`}
        confirmLabel="Start break"
        busy={busy}
        busyProcess="timeIn"
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending === "back"}
        title="Back to work?"
        message={`Your break will end at ${formatTime(now)}.`}
        confirmLabel="Back to work"
        busy={busy}
        busyProcess="timeIn"
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending === "out"}
        title="Time out for today?"
        message={`Your time-out will be recorded at ${formatTime(now)}${
          todayLog ? `, with ${formatDuration(worked)} worked` : ""
        }. You can't undo this.`}
        confirmLabel="Time out"
        cancelLabel="Keep working"
        tone="danger"
        busy={busy}
        busyProcess="timeIn"
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
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

/*
|--------------------------------------------------------------------------
| TIME-IN DIALOG
|--------------------------------------------------------------------------
|
| Two steps. First the camera check, which takes the photo by itself once
| it has seen a live person. Then the student sees the photo, may add a
| note, and confirms.
|
*/

type Capture = { photo: File; preview: string; report: LivenessReport };

function TimeInDialog({
  open,
  now,
  onClose,
  loadChallenge,
  onSubmit,
}: {
  open: boolean;
  now: Date;
  onClose: () => void;
  loadChallenge: () => Promise<LivenessChallenge>;
  onSubmit: (
    photo: File,
    note: string,
    check: { ticket: string; report: LivenessReport }
  ) => Promise<void>;
}) {
  const [challenge, setChallenge] = useState<LivenessChallenge | null>(null);
  const [capture, setCapture] = useState<Capture | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Raised to ask the server for a fresh set of prompts.
  const [round, setRound] = useState(0);

  // Each time the dialog opens (or the photo is retaken) the server picks
  // new prompts, so no two checks ask for the same thing in the same order.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadChallenge()
      .then((next) => {
        if (!cancelled) setChallenge(next);
      })
      .catch((loadError) => {
        if (!cancelled) setError(errorText(loadError, "Could not start the camera check."));
      });
    return () => {
      cancelled = true;
    };
  }, [open, round, loadChallenge]);

  // Release the preview image when it changes or the dialog goes away.
  const preview = capture?.preview;
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const reset = () => {
    setChallenge(null);
    setCapture(null);
    setNote("");
    setError("");
  };

  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const retake = () => {
    setCapture(null);
    setChallenge(null);
    setError("");
    setRound((count) => count + 1);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !capture || !challenge) return;
    setSaving(true);
    setError("");
    try {
      await onSubmit(capture.photo, note, { ticket: challenge.ticket, report: capture.report });
      toast.celebrate("Time-in recorded. Have a good day at work.");
      reset();
      onClose();
    } catch (submitError) {
      setError(errorText(submitError, "Could not record your time-in."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Time in"
      description={
        capture
          ? `Recorded at ${formatTime(now)} when you confirm.`
          : "A quick camera check, then your photo is taken for you."
      }
      locked={saving}
      footer={
        capture ? (
          <>
            <Button variant="secondary" onClick={close} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="time-in-form" busy={saving} failed={Boolean(error)} busyProcess="timeIn" icon="check">
              {saving ? "Recording" : "Confirm time-in"}
            </Button>
          </>
        ) : undefined
      }
    >
      {!capture ? (
        <div className="space-y-4">
          {challenge ? (
            <LivenessCamera
              key={challenge.ticket}
              prompts={challenge.prompts}
              spare={challenge.spare}
              onPassed={(photo, report) =>
                setCapture({ photo, report, preview: URL.createObjectURL(photo) })
              }
            />
          ) : error ? (
            <>
              <FormError message={error} />
              <Button block variant="secondary" icon="refresh" onClick={retake}>
                Try again
              </Button>
            </>
          ) : (
            <BrandLoader role="student" process="timeIn" message="Getting the camera check ready…" />
          )}
        </div>
      ) : (
        <form id="time-in-form" onSubmit={submit} className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-700">Attendance photo</p>
              <StatusBadge status="Camera check passed" tone="good" />
            </div>
            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
              <img
                src={capture.preview}
                alt="Your attendance photo"
                className="max-h-64 w-full object-contain"
              />
              <button
                type="button"
                onClick={retake}
                disabled={saving}
                className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-lg bg-white/95 px-3 py-1.5 text-sm font-semibold text-slate-700 shadow hover:bg-white"
              >
                <Icon name="camera" size={15} />
                Retake
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="time-in-note"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Note <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              id="time-in-note"
              rows={3}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What will you be working on today?"
              className="field resize-none"
            />
          </div>

          <FormError message={error} />
        </form>
      )}
    </Modal>
  );
}
