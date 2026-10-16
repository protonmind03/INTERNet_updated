import { useEffect, useState } from "react";
import { BrandLoader } from "../../brand";
import Icon from "../../components/Icon";
import LivenessCamera, { type LivenessReport } from "../../components/LivenessCamera";
import { Button, FormError, Modal, StatusBadge } from "../../components/ui";
import { cue } from "../../lib/cues";
import { formatTime } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import { useDraft } from "../../lib/useDraft";
import type { LivenessChallenge } from "./useAttendance";

/*
|--------------------------------------------------------------------------
| TIME-IN DIALOG
|--------------------------------------------------------------------------
|
| Two steps. First the camera check; once it has seen a live person the
| student takes the photo with the round button. Then the student sees the
| photo (as it is saved, not mirrored), may add a note, and confirms.
|
| With no connection the camera check cannot run: the server sets it and
| confirms it. The dialog then offers to record the time-in on the phone
| instead, with no photo, and says what that means: it is sent later and
| the supervisor has to confirm it.
|
*/

type Capture = { photo: File; preview: string; report: LivenessReport };

export default function TimeInDialog({
  open,
  now,
  onClose,
  loadChallenge,
  onSubmit,
  online,
  onOffline,
}: {
  open: boolean;
  now: Date;
  onClose: () => void;
  /** What the phone says about its connection now. */
  online: boolean;
  /** Keeps the time-in on the phone. False when the browser cannot. */
  onOffline: (note: string) => Promise<boolean>;
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
  // The note survives a closed dialog or a failed attempt, until it is sent.
  const discardNote = useDraft("student", open ? "time-in-note" : null, note, setNote);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Raised to ask the server for a fresh set of prompts.
  const [round, setRound] = useState(0);
  // Set when the server could not be reached for the camera check.
  const [unreachable, setUnreachable] = useState(false);
  const noConnection = !online || unreachable;

  // Each time the dialog opens (or the photo is retaken) the server picks
  // new prompts, so no two checks ask for the same thing in the same order.
  useEffect(() => {
    // With no connection there is nothing to ask the server for.
    if (!open || !online) return;
    let cancelled = false;
    loadChallenge()
      .then((next) => {
        if (cancelled) return;
        setUnreachable(false);
        setChallenge(next);
      })
      .catch((loadError) => {
        if (cancelled) return;
        // fetch() rejects with a TypeError when the server cannot be reached.
        if (loadError instanceof TypeError) setUnreachable(true);
        else setError(errorText(loadError, "Could not start the camera check."));
      });
    return () => {
      cancelled = true;
    };
  }, [open, online, round, loadChallenge]);

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
    setUnreachable(false);
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
    setUnreachable(false);
    setRound((count) => count + 1);
  };

  const recordOffline = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      if (!(await onOffline(note))) {
        setError("This browser cannot keep a time-in for later. Find a signal, or ask your supervisor to record your time-in.");
        return;
      }
      cue("saved");
      toast.info(`Time-in saved on this phone at ${formatTime(new Date())}. It will be sent when you're back online.`);
      discardNote();
      reset();
      onClose();
    } catch (keepError) {
      setError(errorText(keepError, "Could not save your time-in on this phone."));
    } finally {
      setSaving(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !capture || !challenge) return;
    setSaving(true);
    setError("");
    try {
      await onSubmit(capture.photo, note, { ticket: challenge.ticket, report: capture.report });
      cue("committed");
      toast.celebrate("Time-in recorded. Have a good day at work.");
      discardNote();
      reset();
      onClose();
    } catch (submitError) {
      if (submitError instanceof TypeError) {
        // The connection went between the camera check and sending it. The
        // photo cannot be kept on the phone, so it is let go.
        setCapture(null);
        setChallenge(null);
        setUnreachable(true);
      } else {
        cue("refused");
        setError(errorText(submitError, "Could not record your time-in."));
      }
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
          : noConnection
            ? "There is no connection, so the camera check cannot run."
            : "A quick camera check, then you take your photo."
      }
      locked={saving}
      footer={
        !capture && noConnection ? (
          <>
            <Button variant="secondary" onClick={close} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="offline-time-in-form" busy={saving} failed={Boolean(error)} busyProcess="timeIn" icon="check">
              {saving ? "Saving" : "Time in without a photo"}
            </Button>
          </>
        ) : capture ? (
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
      {!capture && noConnection ? (
        <form id="offline-time-in-form" onSubmit={recordOffline} className="space-y-4">
          <div className="rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-950 ring-1 ring-inset ring-amber-600/20">
            <p className="font-semibold">You can still time in, without a photo.</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li>The time is {formatTime(now)}, from this phone's clock.</li>
              <li>It is kept on this phone and sent when you are back online.</li>
              <li>
                Your supervisor is told there was no photo or camera check, and has to confirm
                that you were at work before the day counts.
              </li>
            </ul>
          </div>
          <div>
            <label htmlFor="time-in-note" className="mb-1.5 block text-sm font-medium text-slate-700">
              Note <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <textarea
              id="time-in-note"
              rows={3}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="For example, where you are and why there is no signal."
              className="field resize-none"
            />
          </div>
          <FormError message={error} />
          {online && (
            <Button block variant="secondary" icon="refresh" onClick={retake} disabled={saving}>
              Try the camera check again
            </Button>
          )}
        </form>
      ) : !capture ? (
        <div className="space-y-4">
          {challenge ? (
            <LivenessCamera
              key={challenge.ticket}
              prompts={challenge.prompts}
              spare={challenge.spare}
              strict={challenge.level === "strict"}
              expiresAt={challenge.expiresAt}
              onRenew={retake}
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
              Note <span className="font-normal text-slate-500">(optional)</span>
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
