import { useCallback, useEffect, useRef, useState } from "react";
import ComplaintThread from "../../components/ComplaintThread";
import Icon from "../../components/Icon";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  SkeletonRows,
  StatusBadge,
} from "../../components/ui";
import StudentLayout from "../../layouts/StudentLayout";
import { API_URL, withStudentAuth } from "../../lib/api";
import { formatFileSize, UPLOAD_ACCEPT, UPLOAD_HINT, uploadProblem } from "../../lib/files";
import { formatDateTime } from "../../lib/format";
import { useAccount } from "../../lib/session";
import { errorText, toast } from "../../lib/toast";
import { useDraft } from "../../lib/useDraft";

type ReportType = "student" | "supervisor";

type Complaint = {
  id: number;
  report_type: ReportType;
  reported_student_name: string | null;
  supervisor_name: string | null;
  company_name: string | null;
  category: string;
  description: string;
  status: string;
  resolution_notes: string | null;
  created_at: string;
};

const CATEGORIES: Record<ReportType, string[]> = {
  student: [
    "Attendance / Tardiness",
    "Unprofessional Behavior",
    "Task Non-completion",
    "Harassment",
    "Other",
  ],
  supervisor: [
    "Unsafe Working Conditions",
    "Unpaid / Excessive Hours",
    "Lack of Supervision",
    "Harassment",
    "Task Unrelated to Course",
    "Other",
  ],
};

const MAX_EVIDENCE_MB = 5;

export default function ReportComplaint() {
  const student = useAccount("student");
  const studentId = student?.student_id;

  const [type, setType] = useState<ReportType>("supervisor");
  const [personName, setPersonName] = useState("");
  const [context, setContext] = useState("");
  const [category, setCategory] = useState(CATEGORIES.supervisor[0]);
  const [description, setDescription] = useState("");
  const discardDescription = useDraft("student", "report-description", description, setDescription);
  const [evidence, setEvidence] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const evidenceInput = useRef<HTMLInputElement | null>(null);

  const [reports, setReports] = useState<Complaint[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState("");
  // The report whose conversation with the coordinator is open, if any.
  const [openThread, setOpenThread] = useState<number | null>(null);

  // The student's own supervisor and company, offered as a starting point.
  const [host, setHost] = useState<{ supervisor: string; company: string } | null>(null);

  const loadReports = useCallback(async () => {
    if (!studentId) return;
    try {
      const response = await fetch(
        `${API_URL}/api/complaints/student/${encodeURIComponent(studentId)}`,
        withStudentAuth()
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not load your reports.");
      setReports(Array.isArray(data.complaints) ? data.complaints : []);
      setReportsError("");
    } catch (loadError) {
      setReportsError(errorText(loadError, "Could not load your reports."));
    } finally {
      setReportsLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void Promise.resolve().then(loadReports);
  }, [loadReports]);

  useEffect(() => {
    if (!studentId) return;
    let active = true;
    fetch(`${API_URL}/api/company/${encodeURIComponent(studentId)}`, withStudentAuth())
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!active || !data?.company) return;
        const found = {
          supervisor: String(data.company.supervisor || ""),
          company: String(data.company.name || ""),
        };
        setHost(found);
        // Fill the form only if the student has not started typing.
        setPersonName((current) => current || found.supervisor);
        setContext((current) => current || found.company);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [studentId]);

  const switchType = (next: ReportType) => {
    if (next === type) return;
    setType(next);
    setCategory(CATEGORIES[next][0]);
    setError("");
    setPersonName(next === "supervisor" ? host?.supervisor || "" : "");
    setContext(next === "supervisor" ? host?.company || "" : "");
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

  const labels =
    type === "student"
      ? {
          person: "Student's name",
          personHint: "The student this report is about",
          context: "Program and section",
          contextHint: "For example, BS Information Technology 4A",
        }
      : {
          person: "Supervisor's name",
          personHint: "The supervisor this report is about",
          context: "Company or host institution",
          contextHint: "Where the incident happened",
        };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!studentId) return;

    if (!personName.trim()) {
      setError(`Enter the ${labels.person.toLowerCase()}.`);
      return;
    }
    if (!context.trim()) {
      setError(`Enter the ${labels.context.toLowerCase()}.`);
      return;
    }
    if (description.trim().length < 20) {
      setError("Describe what happened in at least a sentence or two.");
      return;
    }

    const form = new FormData();
    form.append("student_id", studentId);
    form.append("report_type", type);
    if (type === "student") {
      form.append("reported_student_name", personName.trim());
      form.append("reported_program_section", context.trim());
    } else {
      form.append("supervisor_name", personName.trim());
      form.append("company_name", context.trim());
    }
    form.append("category", category);
    form.append("description", description.trim());
    if (evidence) form.append("evidence", evidence);

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(
        `${API_URL}/api/complaints`,
        withStudentAuth({ method: "POST", body: form })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "Your report could not be submitted.");
      }
      toast.success("Report submitted. Your OJT coordinator will review it.");
      discardDescription();
      setDescription("");
      setEvidence(null);
      if (type === "student") {
        setPersonName("");
        setContext("");
      }
      await loadReports();
    } catch (submitError) {
      setError(errorText(submitError, "Your report could not be submitted."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StudentLayout
      title="Report a concern"
      subtitle="Tell your OJT coordinator about a problem at your placement."
    >
      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <form onSubmit={submit} className="space-y-5 p-4 sm:p-5" noValidate>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700">
                Who is this about?
              </legend>
              <div className="grid grid-cols-2 gap-2">
                <TypeOption
                  active={type === "supervisor"}
                  icon="building"
                  label="Supervisor or company"
                  onClick={() => switchType("supervisor")}
                />
                <TypeOption
                  active={type === "student"}
                  icon="user"
                  label="Another student"
                  onClick={() => switchType("student")}
                />
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={labels.person} hint={labels.personHint} htmlFor="report-person">
                <input
                  id="report-person"
                  type="text"
                  maxLength={150}
                  value={personName}
                  onChange={(event) => setPersonName(event.target.value)}
                  className="field"
                />
              </Field>
              <Field label={labels.context} hint={labels.contextHint} htmlFor="report-context">
                <input
                  id="report-context"
                  type="text"
                  maxLength={150}
                  value={context}
                  onChange={(event) => setContext(event.target.value)}
                  className="field"
                />
              </Field>
            </div>

            <Field label="Category" htmlFor="report-category">
              <select
                id="report-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="field"
              >
                {CATEGORIES[type].map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </Field>

            <Field
              label="What happened?"
              hint="Include dates, times and who was involved, if you can."
              htmlFor="report-description"
            >
              <textarea
                id="report-description"
                rows={6}
                maxLength={4000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="field resize-y"
              />
            </Field>

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
                    <p className="truncate text-sm font-medium text-slate-800">
                      {evidence.name}
                    </p>
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
                    <span className="font-semibold text-psu-700">
                      Attach a photo, screenshot or document
                    </span>
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

            <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                In an emergency, contact your coordinator directly.
              </p>
              <Button type="submit" busy={submitting} doneLabel="Sent" failed={Boolean(error)} busyProcess="report">
                {submitting ? "Submitting" : "Submit report"}
              </Button>
            </div>
          </form>
        </Card>

        <div className="space-y-5 lg:col-span-2">
          <Card className="p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-slate-900">What happens next</h2>
            <ol className="mt-3 space-y-3 text-sm text-slate-600">
              <Step number={1}>Your OJT coordinator receives the report.</Step>
              <Step number={2}>They review it, usually within 3 to 5 working days.</Step>
              <Step number={3}>
                You are notified here when there is a resolution or a follow-up question.
              </Step>
            </ol>
            <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-500">
              Only file reports that are true. False reports may lead to disciplinary action.
            </p>
          </Card>

          <Card>
            <CardHeader title="Your reports" />
            <div className="mt-3">
              {reportsLoading ? (
                <SkeletonRows rows={2} />
              ) : reportsError ? (
                <div className="px-4 pb-4 sm:px-5">
                  <ErrorNotice message={reportsError} onRetry={() => void loadReports()} />
                </div>
              ) : reports.length === 0 ? (
                <EmptyState icon="flag" title="You haven't filed any reports" />
              ) : (
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {reports.map((report) => (
                    <li key={report.id} className="px-4 py-3.5 sm:px-5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-900">
                          {report.category}
                        </p>
                        <StatusBadge status={report.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatDateTime(report.created_at)}
                        {(report.reported_student_name || report.supervisor_name) &&
                          ` · About ${report.reported_student_name || report.supervisor_name}`}
                      </p>
                      <p className="mt-1.5 line-clamp-3 text-sm text-slate-600">
                        {report.description}
                      </p>
                      {report.resolution_notes && (
                        <p className="mt-2 rounded-md bg-emerald-50 px-2.5 py-1.5 text-sm text-emerald-900">
                          <span className="font-semibold">Coordinator:</span>{" "}
                          {report.resolution_notes}
                        </p>
                      )}
                      {openThread === report.id ? (
                        <div className="mt-3 border-t border-slate-100 pt-3">
                          <ComplaintThread complaintId={report.id} role="student" />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setOpenThread(report.id)}
                          className="mt-2 text-sm font-semibold text-psu-700 hover:underline"
                        >
                          Conversation with the coordinator
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>
    </StudentLayout>
  );
}

function TypeOption({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: "building" | "user";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-lg border px-3 py-3 text-left text-sm font-medium transition-colors ${
        active
          ? "border-psu-600 bg-psu-50 text-psu-800 ring-1 ring-psu-600"
          : "border-slate-300 text-slate-700 hover:bg-slate-50"
      }`}
    >
      <Icon name={icon} className={active ? "text-psu-700" : "text-slate-400"} />
      {label}
    </button>
  );
}

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function Step({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-psu-50 text-xs font-semibold text-psu-700">
        {number}
      </span>
      <span>{children}</span>
    </li>
  );
}
