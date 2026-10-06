import { useCallback, useEffect, useRef, useState } from "react";
import ComplaintThread from "../../components/ComplaintThread";
import Icon from "../../components/Icon";
import {
  Button,
  Card,
  EmptyState,
  ErrorNotice,
  Modal,
  SkeletonRows,
  StatusBadge,
} from "../../components/ui";
import SupervisorLayout from "../../layouts/SupervisorLayout";
import { API_URL, downloadProtectedUpload, withSupervisorAuth } from "../../lib/api";
import { formatFileSize, UPLOAD_ACCEPT, UPLOAD_HINT, uploadProblem } from "../../lib/files";
import { formatDateTime } from "../../lib/format";
import { useAccount } from "../../lib/session";
import { errorText, toast } from "../../lib/toast";
import { useSupervisorWork, type Intern } from "./useSupervisorWork";

type Complaint = {
  id: number;
  reported_student_name: string | null;
  category: string;
  description: string;
  status: string;
  resolution_notes: string | null;
  evidence_url?: string | null;
  created_at: string;
};

const CATEGORIES = [
  "Attendance Discrepancy",
  "Behavioral Concern",
  "Task Non-Compliance",
  "Workplace Incident",
  "Other",
];

const MAX_EVIDENCE_MB = 5;

export default function SupervisorComplaints() {
  const supervisor = useAccount("supervisor");
  const supervisorId = supervisor?.supervisor_id;
  const { interns } = useSupervisorWork(supervisorId, ["interns"]);

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filing, setFiling] = useState(false);
  // The report whose conversation with the coordinator is open, if any.
  const [openThread, setOpenThread] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!supervisorId) return;
    try {
      const response = await fetch(
        `${API_URL}/api/complaints/supervisor/${encodeURIComponent(supervisorId)}`,
        withSupervisorAuth()
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not load your reports.");
      setComplaints(Array.isArray(data.complaints) ? data.complaints : []);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load your reports."));
    } finally {
      setLoading(false);
    }
  }, [supervisorId]);

  useEffect(() => {
    const refresh = () => {
      void load();
    };
    refresh();
    window.addEventListener("internet-notification", refresh);
    return () => window.removeEventListener("internet-notification", refresh);
  }, [load]);

  const downloadEvidence = async (path: string) => {
    try {
      await downloadProtectedUpload(path, "supervisor");
    } catch (downloadError) {
      toast.error(errorText(downloadError, "The evidence file could not be downloaded."));
    }
  };

  return (
    <SupervisorLayout
      title="Incidents"
      subtitle="Report a concern about an intern to the OJT coordinator, and follow what happens to it."
      actions={
        <Button icon="plus" onClick={() => setFiling(true)}>
          Report an incident
        </Button>
      }
    >
      <div className="space-y-5">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        <Card>
          {loading ? (
            <SkeletonRows rows={3} />
          ) : complaints.length === 0 ? (
            <EmptyState
              icon="flag"
              title="No incidents reported"
              description="Reports you send to the OJT coordinator are listed here with their status."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {complaints.map((item) => (
                <li key={item.id} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <p className="text-sm font-semibold text-slate-900">{item.category}</p>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatDateTime(item.created_at)}
                    {item.reported_student_name && ` · About ${item.reported_student_name}`}
                  </p>
                  <p className="mt-2 whitespace-pre-line text-sm text-slate-700">
                    {item.description}
                  </p>
                  {item.evidence_url && (
                    <button
                      type="button"
                      onClick={() => void downloadEvidence(item.evidence_url!)}
                      className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-psu-700 hover:underline"
                    >
                      <Icon name="download" size={15} />
                      Download evidence
                    </button>
                  )}
                  {item.resolution_notes && (
                    <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                      <span className="font-semibold">Coordinator:</span> {item.resolution_notes}
                    </p>
                  )}
                  {openThread === item.id ? (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <ComplaintThread complaintId={item.id} role="supervisor" />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpenThread(item.id)}
                      className="mt-2 block text-sm font-semibold text-psu-700 hover:underline"
                    >
                      Conversation with the coordinator
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <FileDialog
        open={filing}
        interns={interns}
        onClose={() => setFiling(false)}
        onFiled={() => {
          setFiling(false);
          void load();
        }}
      />
    </SupervisorLayout>
  );
}

function FileDialog({
  open,
  interns,
  onClose,
  onFiled,
}: {
  open: boolean;
  interns: Intern[];
  onClose: () => void;
  onFiled: () => void;
}) {
  const [studentId, setStudentId] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const evidenceInput = useRef<HTMLInputElement | null>(null);

  const reset = () => {
    setStudentId("");
    setCategory(CATEGORIES[0]);
    setDescription("");
    setEvidence(null);
    setError("");
  };

  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const chooseEvidence = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const problem = uploadProblem(file, MAX_EVIDENCE_MB);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setEvidence(file);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (description.trim().length < 20) {
      setError("Describe what happened in at least a sentence or two.");
      return;
    }
    const form = new FormData();
    const internName = interns.find((intern) => intern.student_id === studentId)?.name;
    if (internName) form.append("reported_student_name", internName);
    // The ID lets the coordinator know exactly which intern this is about.
    if (studentId) form.append("reported_student_id", studentId);
    form.append("category", category);
    form.append("description", description.trim());
    if (evidence) form.append("evidence", evidence);

    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `${API_URL}/api/complaints/supervisor`,
        withSupervisorAuth({ method: "POST", body: form })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "The report could not be sent.");
      toast.success("Report sent to the OJT coordinator.");
      reset();
      onFiled();
    } catch (submitError) {
      setError(errorText(submitError, "The report could not be sent."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Report an incident"
      description="This goes to the OJT coordinator."
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="incident-form" busy={saving} failed={Boolean(error)}>
            {saving ? "Sending" : "Send report"}
          </Button>
        </>
      }
    >
      <form id="incident-form" onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label
            htmlFor="incident-intern"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Intern involved <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <select
            id="incident-intern"
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
            className="field"
          >
            <option value="">Not about a specific intern</option>
            {interns.map((intern) => (
              <option key={intern.student_id} value={intern.student_id}>
                {intern.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="incident-category"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Category
          </label>
          <select
            id="incident-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="field"
          >
            {CATEGORIES.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="incident-description"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            What happened?
          </label>
          <textarea
            id="incident-description"
            rows={5}
            maxLength={4000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Include dates, times and who was involved."
            className="field resize-none"
          />
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">
            Evidence <span className="font-normal text-slate-400">(optional)</span>
          </p>
          <input
            ref={evidenceInput}
            type="file"
            accept={UPLOAD_ACCEPT}
            onChange={chooseEvidence}
            className="sr-only"
            aria-label="Evidence file"
            tabIndex={-1}
          />
          {evidence ? (
            <div className="flex items-center gap-3 rounded-lg border border-slate-300 px-3 py-2.5">
              <Icon name="document" className="shrink-0 text-psu-600" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{evidence.name}</p>
                <p className="text-xs text-slate-500">{formatFileSize(evidence.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => setEvidence(null)}
                aria-label="Remove evidence file"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => evidenceInput.current?.click()}
              className="flex w-full items-center gap-3 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-left hover:border-psu-400 hover:bg-psu-50"
            >
              <Icon name="upload" className="shrink-0 text-slate-400" />
              <span className="text-sm">
                <span className="font-semibold text-psu-700">Attach a file</span>
                <span className="block text-xs text-slate-500">
                  {UPLOAD_HINT}, up to {MAX_EVIDENCE_MB} MB
                </span>
              </span>
            </button>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700"
          >
            <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
