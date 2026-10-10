import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../../components/Icon";
import { Button, FormError, FormField, Modal } from "../../components/ui";
import { ATTENDANCE_PHOTO_MAX_MB, uploadProblem } from "../../lib/files";
import { compressPhoto } from "../../lib/image";
import { formatTime, localDateKey } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import type { SupervisorWork } from "./useSupervisorWork";

/*
|--------------------------------------------------------------------------
| RECORD A TIME-IN IN PERSON
|--------------------------------------------------------------------------
|
| Interns time in through a camera check on their own device. When that
| cannot work (no camera, a fault, a check that keeps failing), the
| supervisor records the time-in here instead: they pick the intern and
| take an ordinary photo. Because the supervisor saw the intern in person,
| the day is verified automatically once the intern times out.
|
*/

const REASONS = [
  "The intern's camera is not working",
  "The camera check kept failing",
  "The intern has no phone or device today",
];
const OTHER = "other";

export default function RecordTimeIn({
  open,
  onClose,
  work,
}: {
  open: boolean;
  onClose: () => void;
  work: SupervisorWork;
}) {
  const [studentId, setStudentId] = useState("");
  const [reasonChoice, setReasonChoice] = useState(REASONS[0]);
  const [otherReason, setOtherReason] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  // Only interns with no log today can be timed in.
  const available = useMemo(() => {
    const today = localDateKey(new Date());
    const logged = new Set(
      work.attendance.filter((entry) => entry.date === today).map((entry) => entry.student_id)
    );
    return work.interns.filter((intern) => !logged.has(intern.student_id));
  }, [work.attendance, work.interns]);

  const chosen = available.find((intern) => intern.student_id === studentId) ?? null;

  const reset = () => {
    setStudentId("");
    setReasonChoice(REASONS[0]);
    setOtherReason("");
    setNote("");
    setPhoto(null);
    setPreview(null);
    setError("");
  };

  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const choosePhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setError("Use a JPG or PNG photo.");
      return;
    }
    const smaller = await compressPhoto(file);
    const problem = uploadProblem(smaller, ATTENDANCE_PHOTO_MAX_MB);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setPhoto(smaller);
    setPreview(URL.createObjectURL(smaller));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const reason = reasonChoice === OTHER ? otherReason.trim() : reasonChoice;
    if (!chosen) {
      setError("Choose the intern you are timing in.");
      return;
    }
    if (!photo) {
      setError("Take a photo of the intern first.");
      return;
    }
    if (reason.length < 3) {
      setError("Say why the camera check was not used.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await work.recordTimeIn(chosen.student_id, photo, reason, note);
      toast.success(
        `Time-in recorded for ${chosen.name}. It is verified automatically when they time out.`
      );
      reset();
      onClose();
    } catch (submitError) {
      setError(errorText(submitError, "The time-in could not be recorded."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Record a time-in"
      description="For an intern whose camera check won't work. You take the photo, and the day is approved on your word."
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="record-time-in-form"
            icon="check"
            busy={saving}
            busyProcess="verify"
            failed={Boolean(error)}
            disabled={available.length === 0}
          >
            {saving ? "Recording" : `Record time-in at ${formatTime(new Date())}`}
          </Button>
        </>
      }
    >
      {available.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">
          {work.interns.length === 0
            ? "No interns are assigned to you yet."
            : "Every one of your interns already has an attendance log for today."}
        </p>
      ) : (
        <form id="record-time-in-form" onSubmit={submit} className="space-y-4">
          <FormField label="Intern" htmlFor="record-intern">
            <select
              id="record-intern"
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              className="field h-11"
            >
              <option value="">Choose an intern</option>
              {available.map((intern) => (
                <option key={intern.student_id} value={intern.student_id}>
                  {intern.name}
                </option>
              ))}
            </select>
          </FormField>

          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">Photo of the intern</p>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg"
              capture="environment"
              onChange={choosePhoto}
              className="sr-only"
              aria-label="Photo of the intern"
            />
            {preview ? (
              <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                <img
                  src={preview}
                  alt="The photo you took of the intern"
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
                className="flex w-full flex-col items-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center transition-colors hover:border-psu-400 hover:bg-psu-50"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-psu-100 text-psu-700">
                  <Icon name="camera" size={22} />
                </span>
                <span className="mt-3 text-sm font-semibold text-slate-800">Take a photo</span>
                <span className="mt-0.5 text-sm text-slate-500">
                  On a phone this opens your camera.
                </span>
              </button>
            )}
          </div>

          <FormField label="Why the camera check was not used" htmlFor="record-reason">
            <select
              id="record-reason"
              value={reasonChoice}
              onChange={(event) => setReasonChoice(event.target.value)}
              className="field h-11"
            >
              {REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
              <option value={OTHER}>Another reason</option>
            </select>
          </FormField>
          {reasonChoice === OTHER && (
            <input
              type="text"
              maxLength={300}
              value={otherReason}
              onChange={(event) => setOtherReason(event.target.value)}
              placeholder="What happened?"
              aria-label="The reason"
              className="field h-11"
            />
          )}

          <FormField label="Note" htmlFor="record-note" optional>
            <textarea
              id="record-note"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="field resize-none"
            />
          </FormField>

          <FormError message={error} />
        </form>
      )}
    </Modal>
  );
}
