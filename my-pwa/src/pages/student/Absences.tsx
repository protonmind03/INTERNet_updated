import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  FormError,
  FormField,
  Modal,
  SkeletonRows,
  StatusBadge,
} from "../../components/ui";
import { API_URL, withStudentAuth } from "../../lib/api";
import { formatDayDate, localDateKey } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";

type Absence = {
  id: number;
  date: string;
  reason: string;
  status: "Pending" | "Excused" | "Unexcused";
  review_notes: string | null;
};

/** "YYYY-MM-DD" a number of days from today, in local time. */
function daysFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

/**
 * The student's absences: days they did not (or will not) report, filed
 * with a reason so the supervisor can mark them excused or not.
 */
export default function Absences({ studentId }: { studentId: string | undefined }) {
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filing, setFiling] = useState(false);
  const [withdrawing, setWithdrawing] = useState<Absence | null>(null);
  const [withdrawBusy, setWithdrawBusy] = useState(false);

  const load = useCallback(async () => {
    if (!studentId) return;
    try {
      const response = await fetch(
        `${API_URL}/api/absences/student/${encodeURIComponent(studentId)}`,
        withStudentAuth()
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not load your absences.");
      setAbsences(data.absences || []);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load your absences."));
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    const refresh = () => {
      void load();
    };
    refresh();
    window.addEventListener("internet-notification", refresh);
    return () => window.removeEventListener("internet-notification", refresh);
  }, [load]);

  const withdraw = async () => {
    if (!withdrawing) return;
    setWithdrawBusy(true);
    try {
      const response = await fetch(
        `${API_URL}/api/absences/${withdrawing.id}`,
        withStudentAuth({ method: "DELETE" })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "The absence could not be withdrawn.");
      toast.success("Absence withdrawn.");
      setWithdrawing(null);
      await load();
    } catch (withdrawError) {
      toast.error(errorText(withdrawError, "The absence could not be withdrawn."));
    } finally {
      setWithdrawBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Absences"
        description="Tell your supervisor about a day you will miss or have missed."
        action={
          <Button variant="secondary" size="sm" icon="plus" onClick={() => setFiling(true)}>
            Report an absence
          </Button>
        }
      />
      <div className="mt-3">
        {loading ? (
          <SkeletonRows rows={2} />
        ) : error ? (
          <p role="alert" className="px-4 pb-4 text-sm text-red-600 sm:px-5">
            {error}
          </p>
        ) : absences.length === 0 ? (
          <EmptyState icon="calendar" title="No absences filed" />
        ) : (
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {absences.map((absence) => (
              <li key={absence.id} className="px-4 py-3.5 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {formatDayDate(absence.date)}
                  </p>
                  <StatusBadge
                    status={absence.status === "Pending" ? "Awaiting review" : absence.status}
                    tone={
                      absence.status === "Excused"
                        ? "good"
                        : absence.status === "Unexcused"
                          ? "bad"
                          : "waiting"
                    }
                  />
                </div>
                <p className="mt-1 text-sm text-slate-600">{absence.reason}</p>
                {absence.review_notes && (
                  <p className="mt-2 rounded-md bg-slate-100 px-2.5 py-1.5 text-sm text-slate-700">
                    <span className="font-semibold">Supervisor:</span> {absence.review_notes}
                  </p>
                )}
                {absence.status === "Pending" && (
                  <button
                    type="button"
                    onClick={() => setWithdrawing(absence)}
                    className="mt-2 text-sm font-semibold text-red-600 hover:underline"
                  >
                    Withdraw
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {filing && (
        <FileAbsenceDialog
          onClose={() => setFiling(false)}
          onFiled={() => {
            setFiling(false);
            void load();
          }}
        />
      )}

      <ConfirmDialog
        open={withdrawing !== null}
        title="Withdraw this absence?"
        message={
          withdrawing
            ? `Your absence for ${formatDayDate(withdrawing.date)} will be removed.`
            : undefined
        }
        confirmLabel="Withdraw"
        tone="danger"
        busy={withdrawBusy}
        onConfirm={() => void withdraw()}
        onCancel={() => setWithdrawing(null)}
      />
    </Card>
  );
}

function FileAbsenceDialog({
  onClose,
  onFiled,
}: {
  onClose: () => void;
  onFiled: () => void;
}) {
  const [date, setDate] = useState(() => localDateKey(new Date()));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!date) return setError("Choose the date of the absence.");
    if (reason.trim().length < 5) return setError("Give a reason for the absence.");
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `${API_URL}/api/absences`,
        withStudentAuth({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, reason: reason.trim() }),
        })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "The absence could not be filed.");
      toast.success("Absence filed. Your supervisor has been notified.");
      onFiled();
    } catch (saveError) {
      setError(errorText(saveError, "The absence could not be filed."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !saving && onClose()}
      title="Report an absence"
      description="Your supervisor decides whether it is excused."
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="absence-form" busy={saving} failed={Boolean(error)}>
            {saving ? "Filing" : "File absence"}
          </Button>
        </>
      }
    >
      <form id="absence-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormField
          label="Date"
          htmlFor="absence-date"
          hint="Up to 30 days back or 30 days ahead."
        >
          <input
            id="absence-date"
            type="date"
            value={date}
            min={daysFromToday(-30)}
            max={daysFromToday(30)}
            onChange={(event) => setDate(event.target.value)}
            className="field"
          />
        </FormField>
        <FormField label="Reason" htmlFor="absence-reason">
          <textarea
            id="absence-reason"
            rows={4}
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="For example, medical appointment, or a required class at school."
            className="field resize-none"
          />
        </FormField>
        <FormError message={error} />
      </form>
    </Modal>
  );
}
