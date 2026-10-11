import { useEffect, useState } from "react";
import { BrandLoader } from "../../brand";
import Icon from "../../components/Icon";
import LivenessCamera, { type LivenessReport } from "../../components/LivenessCamera";
import { Button, FormError, Modal, StatusBadge } from "../../components/ui";
import { formatTime } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import { useDraft } from "../../lib/useDraft";
import type { LivenessChallenge } from "./useAttendance";

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

export default function TimeInDialog({
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
  // The note survives a closed dialog or a failed attempt, until it is sent.
  const discardNote = useDraft("student", open ? "time-in-note" : null, note, setNote);
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
      discardNote();
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
