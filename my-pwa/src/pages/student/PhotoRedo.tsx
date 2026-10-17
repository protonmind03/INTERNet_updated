import { useEffect, useState } from "react";
import { BrandLoader } from "../../brand";
import Icon from "../../components/Icon";
import LivenessCamera, { type LivenessReport } from "../../components/LivenessCamera";
import { Button, FormError, Modal } from "../../components/ui";
import { cue } from "../../lib/cues";
import { formatTime } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import { useTimeIn } from "./timeInContext";
import type { LivenessChallenge } from "./useAttendance";

/*
|--------------------------------------------------------------------------
| RETAKING A REJECTED TIME-IN PHOTO
|--------------------------------------------------------------------------
|
| When the supervisor rejects only the photo of today's time-in, the student
| keeps working (the hours still count) and has a window to take a new one
| with the strict camera check (backend services/photoRedo.ts). The banner
| stays on every student page until the photo is retaken or the window
| closes, and says when that is.
|
*/

/** The banner, on every student page while a new photo is due today. */
export function PhotoRedoBanner() {
  const { attendance, online } = useTimeIn();
  const [open, setOpen] = useState(false);
  const log = attendance.todayLog;
  if (!log || log.photo_redo_status !== "required" || log.time_out) return null;

  const deadline = log.photo_redo_due_at
    ? `by ${formatTime(log.photo_redo_due_at)}`
    : "before you tap Back from lunch";
  return (
    <div role="status" className="mb-5 flex flex-col gap-3 rounded-xl bg-amber-50 px-4 py-3.5 ring-1 ring-inset ring-amber-600/25 sm:flex-row sm:items-center">
      <Icon name="camera" className="hidden shrink-0 text-amber-700 sm:block" />
      <div className="min-w-0 flex-1 text-sm text-amber-950">
        <p className="font-semibold">Retake your time-in photo {deadline}.</p>
        <p className="mt-0.5">
          Your supervisor rejected it{log.photo_rejection_reason ? `: ${log.photo_rejection_reason}` : "."} Keep working:
          your hours still count. If no new photo is taken in time, today is marked absent.
        </p>
      </div>
      <Button icon="camera" onClick={() => setOpen(true)} disabled={!online} className="shrink-0">
        {online ? "Retake photo" : "Connect to retake"}
      </Button>
      {open && <PhotoRedoDialog logId={log.id} onClose={() => setOpen(false)} />}
    </div>
  );
}

type Capture = { photo: File; preview: string; report: LivenessReport };

function PhotoRedoDialog({ logId, onClose }: { logId: number; onClose: () => void }) {
  const { attendance } = useTimeIn();
  const [challenge, setChallenge] = useState<LivenessChallenge | null>(null);
  const [capture, setCapture] = useState<Capture | null>(null);
  const [round, setRound] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { livenessChallenge } = attendance;

  useEffect(() => {
    let cancelled = false;
    livenessChallenge()
      .then((next) => {
        if (!cancelled) setChallenge(next);
      })
      .catch((loadError) => {
        if (!cancelled) setError(errorText(loadError, "Could not start the camera check."));
      });
    return () => {
      cancelled = true;
    };
  }, [round, livenessChallenge]);

  const preview = capture?.preview;
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const retake = () => {
    setCapture(null);
    setChallenge(null);
    setError("");
    setRound((count) => count + 1);
  };

  const send = async () => {
    if (!capture || !challenge) return;
    setSaving(true);
    setError("");
    try {
      await attendance.redoPhoto(logId, capture.photo, { ticket: challenge.ticket, report: capture.report });
      cue("committed");
      toast.success("New photo sent. Your supervisor will review it.");
      onClose();
    } catch (sendError) {
      cue("refused");
      setError(errorText(sendError, "Could not send the new photo."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      locked={saving}
      title="Retake your time-in photo"
      description="The stricter camera check runs this time, then you take the photo."
      footer={
        capture ? (
          <>
            <Button variant="secondary" onClick={retake} disabled={saving}>
              Take another
            </Button>
            <Button onClick={() => void send()} busy={saving} failed={Boolean(error)} busyProcess="timeIn" icon="check">
              Send new photo
            </Button>
          </>
        ) : undefined
      }
    >
      {capture ? (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            <img src={capture.preview} alt="Your new time-in photo" className="max-h-64 w-full object-contain" />
          </div>
          <FormError message={error} />
        </div>
      ) : challenge ? (
        <LivenessCamera
          key={challenge.ticket}
          prompts={challenge.prompts}
          spare={challenge.spare}
          strict={challenge.level === "strict"}
          expiresAt={challenge.expiresAt}
          onRenew={retake}
          onPassed={(photo, report) => setCapture({ photo, report, preview: URL.createObjectURL(photo) })}
        />
      ) : error ? (
        <div className="space-y-3">
          <FormError message={error} />
          <Button block variant="secondary" icon="refresh" onClick={retake}>
            Try again
          </Button>
        </div>
      ) : (
        <BrandLoader role="student" process="timeIn" message="Getting the camera check ready…" />
      )}
    </Modal>
  );
}
