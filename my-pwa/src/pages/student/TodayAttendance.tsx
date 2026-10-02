import { useEffect, useRef, useState } from "react";
import Icon, { type IconName } from "../../components/Icon";
import { Button, ConfirmDialog, Modal, Skeleton, StatusBadge } from "../../components/ui";
import {
  formatClock,
  formatDuration,
  formatHours,
  formatLongDate,
  formatTime,
} from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import { workedMinutes, type AttendanceController } from "./useAttendance";

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

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
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
        toast.success("Time-out recorded. Your supervisor will verify today's log.");
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
    <section className="overflow-hidden rounded-2xl bg-psu-900 text-white">
      <div className="px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
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
          <p className="tabular shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold">
            {formatClock(now)}
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
            Take a photo at your workplace to record your time-in. Your
            supervisor uses it to verify the day.
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
      <ol className="grid grid-cols-4 divide-x divide-white/10 border-t border-white/10 bg-psu-950/40">
        {STEPS.map((step) => {
          const value = todayLog?.[step.key] ?? null;
          return (
            <li key={step.key} className="px-2 py-3 text-center sm:px-4">
              <p className="text-xs text-psu-200">{step.label}</p>
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
        onSubmit={attendance.timeIn}
      />

      <ConfirmDialog
        open={pending === "break"}
        title="Start your break?"
        message={`Your break will start at ${formatTime(now)}. It is not counted in your rendered hours.`}
        confirmLabel="Start break"
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending === "back"}
        title="Back to work?"
        message={`Your break will end at ${formatTime(now)}.`}
        confirmLabel="Back to work"
        busy={busy}
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
*/

function TimeInDialog({
  open,
  now,
  onClose,
  onSubmit,
}: {
  open: boolean;
  now: Date;
  onClose: () => void;
  onSubmit: (photo: File, note: string) => Promise<void>;
}) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Release the preview image when it changes or the dialog goes away.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const reset = () => {
    setPhoto(null);
    setPreview(null);
    setNote("");
    setError("");
  };

  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const choosePhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setError("Use a JPG or PNG photo.");
      return;
    }
    setError("");
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!photo) {
      setError("Take a photo first. It is required to record your time-in.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSubmit(photo, note);
      toast.success("Time-in recorded. Have a good day at work.");
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
      description={`Recorded at ${formatTime(now)} when you confirm.`}
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="time-in-form" busy={saving} icon="check">
            {saving ? "Recording" : "Confirm time-in"}
          </Button>
        </>
      }
    >
      <form id="time-in-form" onSubmit={submit} className="space-y-4">
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">
            Attendance photo
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg"
            capture="environment"
            onChange={choosePhoto}
            className="sr-only"
            aria-label="Attendance photo"
          />
          {preview ? (
            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
              <img
                src={preview}
                alt="Your attendance photo"
                className="max-h-64 w-full object-contain"
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={saving}
                className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-lg bg-white/95 px-3 py-1.5 text-sm font-semibold text-slate-700 shadow hover:bg-white"
              >
                <Icon name="camera" size={15} />
                Retake
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center transition-colors hover:border-psu-400 hover:bg-psu-50"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-psu-100 text-psu-700">
                <Icon name="camera" size={22} />
              </span>
              <span className="mt-3 text-sm font-semibold text-slate-800">
                Take a photo
              </span>
              <span className="mt-0.5 text-sm text-slate-500">
                On a phone this opens your camera.
              </span>
            </button>
          )}
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

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700"
          >
            <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
