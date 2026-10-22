import { useState } from "react";
import { Button, FormError, Modal } from "../../components/ui";
import { API_URL, withStudentAuth } from "../../lib/api";
import { formatDayDate } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import { logDateKey, type AttendanceLog } from "./useAttendance";
import { appealableKinds, type AppealKind } from "./appealRules";

/*
|--------------------------------------------------------------------------
| APPEALING A DECISION ON A LOG
|--------------------------------------------------------------------------
|
| Within seven days of a supervisor correcting a log's times, rejecting its
| time-in photo or rejecting the day, the student may ask the OJT
| coordinator to look at it (backend routes/appeals.ts). One appeal per log
| waits at a time; it can be withdrawn while it waits.
|
*/

const KIND_LABEL: Record<AppealKind, string> = {
  time_correction: "The corrected times",
  time_in_rejection: "The rejected time-in photo",
  attendance_rejection: "The rejected attendance",
};

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(
    `${API_URL}${path}`,
    withStudentAuth({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  );
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "That did not go through.");
  return data;
}

/** "Appeal to the coordinator", or "Withdraw appeal" while one waits. */
export function AppealActions({ log, onChanged }: { log: AttendanceLog; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const kinds = appealableKinds(log);

  if (log.appeal?.status === "open") {
    return (
      <button
        type="button"
        disabled={withdrawing}
        onClick={async () => {
          setWithdrawing(true);
          try {
            await post(`/api/appeals/${log.appeal!.id}/withdraw`, {});
            toast.success("Appeal withdrawn.");
            onChanged();
          } catch (error) {
            toast.error(errorText(error, "Could not withdraw the appeal."));
          } finally {
            setWithdrawing(false);
          }
        }}
        className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-psu-700 hover:underline disabled:opacity-60"
      >
        Withdraw appeal
      </button>
    );
  }
  if (kinds.length === 0) return null;
  return (
    <>
      {/* PSU redesign: Appeal is an outlined button, never like the solid Retake. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Appeal to the coordinator"
        className="inline-flex min-h-11 items-center rounded-lg border-[1.5px] border-psu-600 bg-white px-4 text-sm font-bold text-psu-700 hover:bg-psu-50"
      >
        Appeal
      </button>
      {open && <AppealDialog log={log} kinds={kinds} onClose={() => setOpen(false)} onSent={onChanged} />}
    </>
  );
}

function AppealDialog({
  log,
  kinds,
  onClose,
  onSent,
}: {
  log: AttendanceLog;
  kinds: AppealKind[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [kind, setKind] = useState<AppealKind>(kinds[0]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (reason.trim().length < 10) return setError("Explain why in a sentence or two. The coordinator reads this.");
    setSaving(true);
    setError("");
    try {
      await post("/api/appeals", { attendance_id: log.id, kind, reason: reason.trim() });
      toast.success("Appeal sent to the OJT coordinator. You will be told the decision.");
      onSent();
      onClose();
    } catch (sendError) {
      setError(errorText(sendError, "Could not send the appeal."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      locked={saving}
      title="Appeal to the coordinator"
      description={`Your log for ${formatDayDate(logDateKey(log))}. The OJT coordinator will uphold the decision or overturn it.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="appeal-form" busy={saving} failed={Boolean(error)} icon="check">
            Send appeal
          </Button>
        </>
      }
    >
      <form id="appeal-form" onSubmit={submit} className="space-y-4">
        {kinds.length > 1 && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-slate-700">What are you appealing?</legend>
            <div className="space-y-1">
              {kinds.map((value) => (
                <label key={value} className="flex min-h-11 items-center gap-2.5 text-sm text-slate-800">
                  <input type="radio" name="appeal-kind" value={value} checked={kind === value} onChange={() => setKind(value)} />
                  {KIND_LABEL[value]}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div>
          <label htmlFor="appeal-reason" className="mb-1.5 block text-sm font-medium text-slate-700">
            Why should it be changed?
          </label>
          <textarea
            id="appeal-reason"
            rows={4}
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="For example, what happened that day and who can confirm it."
            className="field resize-none"
          />
          <p className="mt-1 text-right text-xs text-slate-500">{reason.length} / 1000</p>
        </div>
        <FormError message={error} />
      </form>
    </Modal>
  );
}
