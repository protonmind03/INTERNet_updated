import { useEffect, useRef, useState } from "react";
import Icon from "../../components/Icon";
import { Button, FormError, FormField, Modal } from "../../components/ui";
import { formatDayDate, formatLongDate, formatTime } from "../../lib/format";
import { ATTENDANCE_PHOTO_MAX_MB, shrinkPhoto, uploadProblem } from "../../lib/files";
import { errorText, toast } from "../../lib/toast";
import {
  logDateKey,
  type AttendanceController,
  type AttendanceLog,
} from "./useAttendance";

/*
|--------------------------------------------------------------------------
| ATTENDANCE CORRECTIONS
|--------------------------------------------------------------------------
|
| The two ways a student can put a log right:
|  - enter the time-out for an earlier day they forgot to close, and
|  - ask the supervisor to look again at a log that was rejected.
| Either one sends the log back to the supervisor as pending.
|
*/

/** "2026-10-01T17:00" for a datetime-local input, in local time. */
function toInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

const MAX_SHIFT_HOURS = 16;

/** A banner shown while an earlier day is still missing its time-out. */
export function MissedTimeOutNotice({ attendance }: { attendance: AttendanceController }) {
  const [open, setOpen] = useState(false);
  const log = attendance.openPastLog;
  if (!log) return null;

  return (
    <>
      <div className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3.5 sm:flex-row sm:items-center">
        <Icon name="clock" className="hidden shrink-0 text-amber-700 sm:block" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-950">
            You didn't time out on {formatDayDate(logDateKey(log))}
          </p>
          <p className="text-sm text-amber-900">
            That day can't be verified or counted until it has a time-out. Enter the time you
            left, and your supervisor will review it.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Enter time-out
        </Button>
      </div>
      {open && (
        <LateTimeOutDialog log={log} attendance={attendance} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

/** Mount this only while it should be open; it starts fresh each time. */
export function LateTimeOutDialog({
  log,
  attendance,
  onClose,
}: {
  log: AttendanceLog;
  attendance: AttendanceController;
  onClose: () => void;
}) {
  const timeIn = new Date(log.time_in || log.date);
  const earliest = new Date(log.break_end_time || log.break_time || log.time_in || log.date);

  // Start from 5 PM on the day of the log, the usual end of a shift.
  const [value, setValue] = useState(() => {
    const suggestion = new Date(timeIn);
    suggestion.setHours(17, 0, 0, 0);
    if (suggestion.getTime() <= earliest.getTime()) {
      suggestion.setTime(earliest.getTime() + 3_600_000);
    }
    return toInputValue(suggestion);
  });
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // The latest time that can be entered: now, or the end of a long shift.
  const [latest] = useState(
    () => new Date(Math.min(Date.now(), timeIn.getTime() + MAX_SHIFT_HOURS * 3_600_000))
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const chosen = new Date(value);
    if (Number.isNaN(chosen.getTime())) return setError("Enter the time you left.");
    if (chosen.getTime() <= earliest.getTime()) {
      return setError(
        log.break_time
          ? `The time-out must be after your break (${formatTime(earliest)}).`
          : `The time-out must be after your time-in (${formatTime(timeIn)}).`
      );
    }
    if (chosen.getTime() > Date.now()) return setError("The time-out can't be in the future.");
    if (chosen.getTime() > latest.getTime()) {
      return setError(`The time-out must be within ${MAX_SHIFT_HOURS} hours of your time-in.`);
    }
    if (reason.trim().length < 5) {
      return setError("Say briefly why you couldn't time out on the day.");
    }

    setSaving(true);
    setError("");
    try {
      await attendance.lateTimeOut(log.id, chosen, reason.trim());
      toast.success("Time-out saved. Your supervisor will review it.");
      onClose();
    } catch (saveError) {
      setError(errorText(saveError, "The time-out could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !saving && onClose()}
      title="Enter a missed time-out"
      description={`${formatLongDate(logDateKey(log))} · You timed in at ${formatTime(timeIn)}`}
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="late-time-out-form" busy={saving} failed={Boolean(error)}>
            {saving ? "Saving" : "Save time-out"}
          </Button>
        </>
      }
    >
      <form id="late-time-out-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormField
          label="When did you leave?"
          htmlFor="late-time-out"
          hint="Enter the real time. Your supervisor checks it before the day is counted."
        >
          <input
            id="late-time-out"
            type="datetime-local"
            value={value}
            min={toInputValue(earliest)}
            max={toInputValue(latest)}
            onChange={(event) => setValue(event.target.value)}
            className="field"
          />
        </FormField>
        <FormField label="Why wasn't it recorded on the day?" htmlFor="late-time-out-reason">
          <textarea
            id="late-time-out-reason"
            rows={3}
            maxLength={300}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="For example, my phone ran out of battery before I left."
            className="field resize-none"
          />
        </FormField>
        <FormError message={error} />
      </form>
    </Modal>
  );
}

/** Mount this only while it should be open; it starts fresh each time. */
export function ResubmitDialog({
  log,
  attendance,
  onClose,
}: {
  log: AttendanceLog;
  attendance: AttendanceController;
  onClose: () => void;
}) {
  const [explanation, setExplanation] = useState("");
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

  const choosePhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (!chosen) return;
    if (!["image/jpeg", "image/png"].includes(chosen.type)) {
      setError("Use a JPG or PNG photo.");
      return;
    }
    const file = await shrinkPhoto(chosen);
    const problem = uploadProblem(file, ATTENDANCE_PHOTO_MAX_MB);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (explanation.trim().length < 5) {
      return setError("Explain what you corrected, or why the log is accurate.");
    }
    setSaving(true);
    setError("");
    try {
      await attendance.resubmit(log.id, explanation, photo);
      toast.success("Sent to your supervisor for another review.");
      onClose();
    } catch (saveError) {
      setError(errorText(saveError, "The log could not be sent for review."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !saving && onClose()}
      title="Ask for another review"
      description={formatLongDate(logDateKey(log))}
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="resubmit-form" busy={saving} failed={Boolean(error)}>
            {saving ? "Sending" : "Send for review"}
          </Button>
        </>
      }
    >
      <form id="resubmit-form" onSubmit={submit} className="space-y-4" noValidate>
        {log.review_notes && (
          <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-800">
            <span className="font-semibold">Why it was rejected:</span> {log.review_notes}
          </p>
        )}

        <FormField
          label="Your response"
          htmlFor="resubmit-explanation"
          hint="Your supervisor reads this with the log."
        >
          <textarea
            id="resubmit-explanation"
            rows={4}
            maxLength={500}
            value={explanation}
            onChange={(event) => setExplanation(event.target.value)}
            placeholder="What did you correct, or why is the log accurate?"
            className="field resize-none"
          />
        </FormField>

        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">
            Replacement photo <span className="font-normal text-slate-400">(optional)</span>
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg"
            onChange={choosePhoto}
            className="sr-only"
            aria-label="Replacement photo"
            tabIndex={-1}
          />
          {preview ? (
            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
              <img
                src={preview}
                alt="Replacement attendance photo"
                className="max-h-56 w-full object-contain"
              />
              <button
                type="button"
                onClick={() => {
                  setPhoto(null);
                  setPreview(null);
                }}
                disabled={saving}
                className="absolute bottom-2 right-2 rounded-lg bg-white/95 px-3 py-1.5 text-sm font-semibold text-slate-700 shadow hover:bg-white"
              >
                Remove
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full items-center gap-3 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-left hover:border-psu-400 hover:bg-psu-50"
            >
              <Icon name="camera" className="shrink-0 text-slate-400" />
              <span className="text-sm">
                <span className="font-semibold text-psu-700">Add a different photo</span>
                <span className="block text-xs text-slate-500">
                  Only if the original photo was the problem. A replacement is not
                  camera-checked, and your supervisor is told so.
                </span>
              </span>
            </button>
          )}
        </div>

        <FormError message={error} />
      </form>
    </Modal>
  );
}
