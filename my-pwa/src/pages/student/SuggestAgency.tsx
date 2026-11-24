import { useCallback, useEffect, useState } from "react";
import { Button, ConfirmDialog, FormError, FormField, StatusBadge } from "../../components/ui";
import { API_URL, withStudentAuth } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { useAccount } from "../../lib/session";
import { errorText, toast } from "../../lib/toast";

/*
| Phase 1.3: a trainee suggests an agency for internships, from the Host
| company card. The coordinator decides it; approving one records the
| company, which is then screened before anyone is placed there. Sending
| needs a connection; nothing is kept for later.
*/

type Suggestion = { id: number; company_name: string; status: "submitted" | "screening" | "approved" | "rejected"; decision_note: string | null; created_at: string };

const WORDS: Record<Suggestion["status"], { label: string; tone: "info" | "waiting" | "good" | "neutral" }> = {
  submitted: { label: "Sent", tone: "info" },
  screening: { label: "Being looked at", tone: "waiting" },
  approved: { label: "Accepted", tone: "good" },
  rejected: { label: "Declined", tone: "neutral" },
};

export default function SuggestAgency() {
  const student = useAccount("student");
  const studentId = student?.student_id;
  const [mine, setMine] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ company_name: "", address: "", contact: "", reason: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!studentId) return;
    const response = await fetch(`${API_URL}/api/students/${encodeURIComponent(studentId)}/company-requests`, withStudentAuth()).catch(() => null);
    if (response?.ok) setMine(((await response.json()) as { requests: Suggestion[] }).requests);
  }, [studentId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const send = async () => {
    if (form.company_name.trim().length < 2 || form.reason.trim().length < 10) {
      setError("Give the agency's name and, in a sentence, why it would be a good place for an internship.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `${API_URL}/api/company-requests`,
        withStudentAuth({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "The suggestion could not be sent.");
      toast.success(data.message);
      setOpen(false);
      setForm({ company_name: "", address: "", contact: "", reason: "" });
      await load();
    } catch (sendError) {
      setError(errorText(sendError, "The suggestion could not be sent."));
    } finally {
      setBusy(false);
    }
  };

  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="border-t border-slate-100 pt-3">
      <Button variant="secondary" icon="plus" onClick={() => setOpen(true)}>
        Suggest an agency
      </Button>
      {mine.length > 0 && (
        <ul className="mt-3 space-y-2">
          {mine.slice(0, 5).map((item) => (
            <li key={item.id} className="text-sm">
              <p className="flex flex-wrap items-center gap-2 text-slate-900">
                {item.company_name}
                <StatusBadge status={WORDS[item.status].label} tone={WORDS[item.status].tone} />
              </p>
              <p className="text-xs text-slate-500">
                Suggested {formatDate(item.created_at)}
                {item.status === "rejected" && item.decision_note ? `. ${item.decision_note}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={open}
        title="Suggest an agency"
        message="Your coordinator decides it. An accepted agency is screened before anyone is placed there."
        confirmLabel="Send the suggestion"
        busy={busy}
        onConfirm={() => void send()}
        onCancel={() => setOpen(false)}
      >
        <div className="space-y-3">
          <FormField label="Agency or company name" htmlFor="suggest-name">
            <input id="suggest-name" className="field" maxLength={150} value={form.company_name} onChange={(event) => set("company_name")(event.target.value)} />
          </FormField>
          <FormField label="Address" htmlFor="suggest-address" optional>
            <input id="suggest-address" className="field" maxLength={300} value={form.address} onChange={(event) => set("address")(event.target.value)} />
          </FormField>
          <FormField label="Contact person or number" htmlFor="suggest-contact" optional>
            <input id="suggest-contact" className="field" maxLength={200} value={form.contact} onChange={(event) => set("contact")(event.target.value)} />
          </FormField>
          <FormField label="Why it would be a good place" htmlFor="suggest-reason">
            <textarea id="suggest-reason" className="field min-h-20" maxLength={1000} value={form.reason} onChange={(event) => set("reason")(event.target.value)} />
          </FormField>
          <FormError message={error} />
        </div>
      </ConfirmDialog>
    </div>
  );
}
