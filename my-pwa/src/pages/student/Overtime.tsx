import { useCallback, useEffect, useState } from "react";
import { Button, Card, CardHeader, ConfirmDialog, EmptyState, FormError, FormField, SkeletonRows, StatusBadge } from "../../components/ui";
import { API_URL, withStudentAuth } from "../../lib/api";
import { formatDayDate } from "../../lib/format";
import { phToday } from "../../lib/phTime";
import { savedFetch } from "../../lib/offlineStore";
import { errorText, toast } from "../../lib/toast";
import { useDraft } from "../../lib/useDraft";
import { useOnline } from "../../lib/useOnline";

/*
| Phase 1.4: overtime. A day's hours stop at the scheduled end unless the
| supervisor approves overtime for it, asked for here before or on the day.
| Asking needs a connection; the reason typed is kept as a draft on the
| phone meanwhile. Up to a few days a week may be approved (the OJT rule).
*/

type Request = {
  id: number;
  work_date: string;
  planned_start: string;
  planned_end: string;
  reason: string;
  form_name: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decision_note: string | null;
  version: number;
};

const WORDS: Record<Request["status"], { label: string; tone: "waiting" | "good" | "bad" | "neutral" }> = {
  pending: { label: "Waiting", tone: "waiting" },
  approved: { label: "Approved", tone: "good" },
  rejected: { label: "Not approved", tone: "bad" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

const twelveHour = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
};

export default function Overtime({ studentId }: { studentId: string | undefined }) {
  const online = useOnline();
  const [requests, setRequests] = useState<Request[] | null>(null);
  const [week, setWeek] = useState<{ approved: number; limit: number } | null>(null);
  const [asking, setAsking] = useState(false);
  const [form, setForm] = useState({ work_date: phToday(), planned_start: "17:00", planned_end: "19:00" });
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<Request | null>(null);
  const clearDraft = useDraft("student", asking ? "overtime-reason" : null, reason, setReason);

  const load = useCallback(async () => {
    if (!studentId) return;
    try {
      const response = await savedFetch("student", "overtime", `${API_URL}/api/students/${encodeURIComponent(studentId)}/overtime`, withStudentAuth());
      if (!response.ok) return;
      const data = (await response.json()) as { requests: Request[]; week: { approved: number; limit: number } };
      setRequests(data.requests);
      setWeek(data.week);
    } catch {
      setRequests((current) => current ?? []);
    }
  }, [studentId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const send = async () => {
    if (!studentId) return;
    if (!online) {
      setError("Asking for overtime needs a connection. Your reason is kept on this phone; send it when you are back online.");
      return;
    }
    if (reason.trim().length < 5) {
      setError("Say in a line why the overtime is needed.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("work_date", form.work_date);
      body.set("planned_start", form.planned_start);
      body.set("planned_end", form.planned_end);
      body.set("reason", reason.trim());
      if (file) body.set("form", file);
      const response = await fetch(`${API_URL}/api/students/${encodeURIComponent(studentId)}/overtime`, withStudentAuth({ method: "POST", body }));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "The request could not be sent.");
      toast.success(data.message);
      clearDraft();
      setReason("");
      setFile(null);
      setAsking(false);
      await load();
    } catch (sendError) {
      setError(errorText(sendError, "The request could not be sent."));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!cancelling || !studentId) return;
    setBusy(true);
    try {
      const response = await fetch(`${API_URL}/api/students/${encodeURIComponent(studentId)}/overtime/${cancelling.id}/cancel`, withStudentAuth({ method: "POST" }));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "The request could not be cancelled.");
      toast.success(data.message);
      setCancelling(null);
      await load();
    } catch (cancelError) {
      toast.error(errorText(cancelError, "The request could not be cancelled."));
    } finally {
      setBusy(false);
    }
  };

  const today = phToday();
  const shown = (requests ?? []).filter((item) => item.status !== "cancelled").slice(0, 8);

  return (
    <Card>
      <CardHeader
        title="Overtime"
        description={
          week
            ? `${week.approved} of ${week.limit} approved this week. Hours after your scheduled end count only on an approved day.`
            : "Hours after your scheduled end count only on a day your supervisor approved."
        }
        action={
          <Button variant="secondary" size="sm" icon="plus" onClick={() => setAsking(true)}>
            Ask for overtime
          </Button>
        }
      />
      <div className="mt-3">
        {requests === null ? (
          <SkeletonRows rows={2} />
        ) : shown.length === 0 ? (
          <EmptyState icon="clock" title="No overtime asked for" description="Ask before or on the day you will stay late." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((item) => (
              <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                    {formatDayDate(item.work_date)}
                    <StatusBadge status={WORDS[item.status].label} tone={WORDS[item.status].tone} />
                  </p>
                  <p className="text-sm text-slate-600">
                    Until {twelveHour(item.planned_end)}. {item.reason}
                  </p>
                  {item.status === "rejected" && item.decision_note && <p className="text-sm text-slate-600">Your supervisor: {item.decision_note}</p>}
                </div>
                {(item.status === "pending" || (item.status === "approved" && item.work_date > today)) && (
                  <button type="button" onClick={() => setCancelling(item)} className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-psu-700 hover:bg-slate-100">
                    Cancel<span className="sr-only"> the overtime of {formatDayDate(item.work_date)}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={asking}
        title="Ask for overtime"
        message="Your supervisor approves it. The hours after your scheduled end count up to the end you give, once approved."
        confirmLabel="Send the request"
        busy={busy}
        onConfirm={() => void send()}
        onCancel={() => setAsking(false)}
      >
        <div className="space-y-3">
          {!online && (
            <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              You are offline. Asking needs a connection; what you type is kept on this phone.
            </p>
          )}
          <FormField label="Day" htmlFor="overtime-date">
            <input id="overtime-date" type="date" min={today} className="field" value={form.work_date} onChange={(event) => setForm((current) => ({ ...current, work_date: event.target.value }))} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="From" htmlFor="overtime-start">
              <input id="overtime-start" type="time" className="field" value={form.planned_start} onChange={(event) => setForm((current) => ({ ...current, planned_start: event.target.value }))} />
            </FormField>
            <FormField label="Until" htmlFor="overtime-end">
              <input id="overtime-end" type="time" className="field" value={form.planned_end} onChange={(event) => setForm((current) => ({ ...current, planned_end: event.target.value }))} />
            </FormField>
          </div>
          <FormField label="Why" htmlFor="overtime-reason">
            <textarea id="overtime-reason" className="field min-h-20" maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} />
          </FormField>
          <FormField label="Signed Overtime Form" htmlFor="overtime-form" optional hint="A PDF or photo of the form, if your company signs one.">
            <input id="overtime-form" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="block w-full text-sm" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </FormField>
          <FormError message={error} />
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={cancelling !== null}
        title="Cancel this overtime?"
        message={cancelling ? `Your overtime of ${formatDayDate(cancelling.work_date)} until ${twelveHour(cancelling.planned_end)} is cancelled. You can ask again.` : undefined}
        confirmLabel="Cancel the overtime"
        cancelLabel="Keep it"
        tone="danger"
        busy={busy}
        onConfirm={() => void cancel()}
        onCancel={() => setCancelling(null)}
      />
    </Card>
  );
}
