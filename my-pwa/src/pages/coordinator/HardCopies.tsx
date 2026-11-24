import { useCallback, useEffect, useState } from "react";
import { Button, Card, CardHeader, ConfirmDialog, ErrorNotice, FormError, FormField, SkeletonRows, StatusBadge } from "../../components/ui";
import { API_URL, withCoordinatorAuth } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { phToday } from "../../lib/phTime";
import { saveFile } from "../../lib/saveFile";
import { errorText, toast } from "../../lib/toast";
import { coordinatorRequest } from "./request";

/*
| Phase 2.4: the paper side. For each of a student's documents and final
| evaluations, the coordinator records the hard copy that came in (who
| received it, when, and a scan of the transmittal letter if there is one),
| and prints a transmittal letter for the OJT office. Health and clearance
| documents are recorded here but never listed on the printed letter.
*/

type Item = {
  record_type: "document" | "final_evaluation";
  record_id: number;
  label: string;
  status: string;
  dated: string | null;
  restricted: boolean;
  hard_copy: { received_on: string; received_by_name: string; note: string | null; has_scan: boolean } | null;
};
type Answer = { student: { student_id: string; name: string; company: string | null; program: string | null; program_name: string | null; coordinator: string | null }; items: Item[] };
type Draft = { item: Item; received_on: string; received_by_name: string; note: string; scan: File | null };

/** Documents worth a hard copy: approved ones and final evaluations. */
const counts = (item: Item) => item.record_type === "final_evaluation" || item.status === "Approved";

export default function HardCopies({ studentId }: { studentId: string }) {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<Item | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [busy, setBusy] = useState(false);
  const base = `/api/coordinator/students/${encodeURIComponent(studentId)}/hard-copies`;

  const load = useCallback(async () => {
    try {
      setAnswer(await coordinatorRequest<Answer>(base));
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "The hard copies could not be loaded."));
    }
  }, [base]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setDialogError("");
    try {
      const form = new FormData();
      form.append("received_on", draft.received_on);
      form.append("received_by_name", draft.received_by_name);
      form.append("note", draft.note);
      if (draft.scan) form.append("scan", draft.scan);
      const response = await fetch(`${API_URL}${base}/${draft.item.record_type}/${draft.item.record_id}`, withCoordinatorAuth({ method: "PUT", body: form }));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "The hard copy could not be recorded.");
      toast.success(data.message);
      setDraft(null);
      await load();
    } catch (saveError) {
      setDialogError(errorText(saveError, "The hard copy could not be recorded."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    setDialogError("");
    try {
      const data = await coordinatorRequest<{ message: string }>(`${base}/${removing.record_type}/${removing.record_id}`, { method: "DELETE" });
      toast.success(data.message);
      setRemoving(null);
      await load();
    } catch (removeError) {
      setDialogError(errorText(removeError, "The hard copy could not be taken off."));
    } finally {
      setBusy(false);
    }
  };

  const openScan = async (item: Item) => {
    try {
      await saveFile(`${API_URL}${base}/${item.record_type}/${item.record_id}/scan`, withCoordinatorAuth(), "transmittal");
    } catch (scanError) {
      toast.error(errorText(scanError, "The scan could not be opened."));
    }
  };

  const printLetter = async () => {
    if (!answer) return;
    try {
      const { buildTransmittalPdf } = await import("../../lib/transmittalPdf");
      const lines = answer.items
        .filter((item) => counts(item) && !item.restricted)
        .map((item) => ({ label: item.label, dated: item.dated, received_on: item.hard_copy?.received_on ?? null, received_by: item.hard_copy?.received_by_name ?? null }));
      const { student } = answer;
      buildTransmittalPdf(
        { name: student.name, student_id: student.student_id, program: student.program_name ?? student.program, company: student.company },
        lines,
        student.coordinator ?? "OJT coordinator",
        phToday()
      ).save(`transmittal-${student.student_id}.pdf`);
    } catch (pdfError) {
      toast.error(errorText(pdfError, "The letter could not be made."));
    }
  };

  const items = (answer?.items ?? []).filter(counts);
  const received = items.filter((item) => item.hard_copy).length;

  return (
    <Card>
      <CardHeader icon="clipboard" title="Hard copies" description="Paper copies received, for the OJT office's file." />
      <div className="space-y-4 px-4 pb-5 pt-3 sm:px-5">
        {error ? (
          <ErrorNotice message={error} onRetry={() => void load()} />
        ) : answer === null ? (
          <SkeletonRows rows={2} />
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-600">No approved documents or final evaluation yet.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-slate-600">
                {received} of {items.length} received.
              </p>
              <Button variant="secondary" icon="download" onClick={() => void printLetter()}>
                Print the transmittal letter
              </Button>
            </div>
            <ul className="divide-y divide-slate-100">
              {items.map((item) => (
                <li key={`${item.record_type}-${item.record_id}`} className="py-3">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                    {item.label}
                    {item.hard_copy && <StatusBadge status="Hard copy received" tone="good" />}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {item.hard_copy
                      ? `Received ${formatDate(item.hard_copy.received_on)} by ${item.hard_copy.received_by_name}${item.hard_copy.note ? `. ${item.hard_copy.note}` : ""}`
                      : item.dated
                        ? `Dated ${formatDate(item.dated)}`
                        : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setDraft({
                          item,
                          received_on: item.hard_copy?.received_on ?? phToday(),
                          received_by_name: item.hard_copy?.received_by_name ?? answer.student.coordinator ?? "",
                          note: item.hard_copy?.note ?? "",
                          scan: null,
                        })
                      }
                    >
                      {item.hard_copy ? "Change" : "Record the hard copy"}
                      <span className="sr-only">: {item.label}</span>
                    </Button>
                    {item.hard_copy?.has_scan && (
                      <Button variant="secondary" onClick={() => void openScan(item)}>
                        Transmittal scan<span className="sr-only">: {item.label}</span>
                      </Button>
                    )}
                    {item.hard_copy && (
                      <Button variant="secondary" onClick={() => setRemoving(item)}>
                        Not received<span className="sr-only">: {item.label}</span>
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <ConfirmDialog
        open={draft !== null}
        title={draft ? `Hard copy: ${draft.item.label}` : ""}
        confirmLabel="Record it"
        busy={busy}
        onConfirm={() => void save()}
        onCancel={() => {
          setDraft(null);
          setDialogError("");
        }}
      >
        {draft && (
          <div className="space-y-3">
            <FormField label="Received on" htmlFor="hard-copy-on">
              <input id="hard-copy-on" type="date" className="field min-h-11" max={phToday()} value={draft.received_on} onChange={(event) => setDraft({ ...draft, received_on: event.target.value })} />
            </FormField>
            <FormField label="Received by" htmlFor="hard-copy-by">
              <input id="hard-copy-by" className="field min-h-11" maxLength={150} value={draft.received_by_name} onChange={(event) => setDraft({ ...draft, received_by_name: event.target.value })} />
            </FormField>
            <FormField label="Note" htmlFor="hard-copy-note" optional>
              <input id="hard-copy-note" className="field min-h-11" maxLength={500} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} />
            </FormField>
            <FormField label="Transmittal letter scan" htmlFor="hard-copy-scan" optional hint={draft.item.hard_copy?.has_scan ? "A scan is kept. A new one replaces it." : "PDF, JPG or PNG."}>
              <input id="hard-copy-scan" type="file" accept=".pdf,.jpg,.jpeg,.png" className="field min-h-11" onChange={(event) => setDraft({ ...draft, scan: event.target.files?.[0] ?? null })} />
            </FormField>
            <FormError message={dialogError} />
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={removing !== null}
        title={removing ? `Take off the hard copy of ${removing.label}?` : ""}
        message="Use this when it was recorded by mistake. Its transmittal scan is removed too."
        confirmLabel="Take it off"
        tone="danger"
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => {
          setRemoving(null);
          setDialogError("");
        }}
      >
        <FormError message={dialogError} />
      </ConfirmDialog>
    </Card>
  );
}
