import { useCallback, useEffect, useMemo, useState } from "react";
import DateRangeFilter from "../../components/DateRangeFilter";
import Icon from "../../components/Icon";
import Pagination from "../../components/Pagination";
import {
  Button,
  Card,
  Modal,
  CardHeader,
  EmptyState,
  ErrorNotice,
  FilterChips,
  ProgressBar,
  SearchField,
  SkeletonRows,
  StatusBadge,
} from "../../components/ui";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import { isWithinDateRange } from "../../lib/dateRange";
import { formatFileSize } from "../../lib/files";
import { formatDate, localDateKey } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";
import { usePagination } from "../../lib/usePagination";
import FilterBar from "./FilterBar";
import { coordinatorRequest, downloadDocumentsZip, downloadSubmittedDocument } from "./request";
import DocumentGroups from "./DocumentGroups";
import { useStudentFilters } from "./useStudentFilters";

type DocumentStatus = "Pending" | "Approved" | "Rejected";

type SubmittedDocument = {
  id: number;
  student_id: string;
  student_name: string | null;
  company: string | null;
  supervisor_name: string | null;
  doc_type: string;
  original_filename: string;
  size_bytes: number | string;
  status: DocumentStatus;
  review_notes: string | null;
  uploaded_at: string;
  /** Who reviews this file: the supervisor unless its requirement says the coordinator. Missing from an older server. */
  reviewer_role?: "supervisor" | "coordinator";
};

type StudentProgress = {
  student_id: string;
  name: string;
  program: string | null;
  company: string | null;
  supervisor_name: string | null;
  /** Where the student is placed, for the grouped view. Missing from an older server. */
  college?: string | null;
  program_name?: string | null;
  block?: string | null;
  approved: number;
  pending: number;
  rejected: number;
  /** How many documents are asked of this student: not every requirement is everyone's. Missing from an older server. */
  required?: number;
  missing: string[];
};

type Scope = "all" | "incomplete";
type StatusFilter = "all" | DocumentStatus;

export default function CoordinatorDocuments() {
  const [documents, setDocuments] = useState<SubmittedDocument[]>([]);
  const [students, setStudents] = useState<StudentProgress[]>([]);
  const [requirements, setRequirements] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  // Requirement progress as a list of students, or as College > Program > Block > Student.
  const [layout, setLayout] = useState<"students" | "groups">("students");
  // One requirement's files, or every requirement's.
  const [docType, setDocType] = useState("");
  const [zipping, setZipping] = useState(false);
  // A deliverable of the coordinator's being rejected: a reason is asked for first.
  const [rejecting, setRejecting] = useState<SubmittedDocument | null>(null);
  const [reason, setReason] = useState("");
  const [deciding, setDeciding] = useState<number | null>(null);

  const decide = async (item: SubmittedDocument, approve: boolean, note = "") => {
    setDeciding(item.id);
    try {
      await coordinatorRequest(`/api/documents/${item.id}/review`, {
        method: "PATCH",
        body: { status: approve ? "Approved" : "Rejected", review_notes: note },
      });
      toast.success(`${item.doc_type} ${approve ? "approved" : "rejected"}. ${item.student_name || "The student"} has been told.`);
      setRejecting(null);
      setReason("");
      await load();
    } catch (decideError) {
      toast.error(errorText(decideError, "The decision could not be saved."));
    } finally {
      setDeciding(null);
    }
  };
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const studentFilters = useStudentFilters();
  const chosen = studentFilters.query;

  const load = useCallback(async () => {
    try {
      const data = await coordinatorRequest<{
        documents: SubmittedDocument[];
        students: StudentProgress[];
        requirements: string[];
      }>(`/api/coordinator/documents${chosen ? `?${chosen}` : ""}`);
      setDocuments(data.documents || []);
      setStudents(data.students || []);
      setRequirements(data.requirements || []);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load submitted documents."));
    } finally {
      setLoading(false);
    }
  }, [chosen]);

  useEffect(() => {
    const refresh = () => {
      void load();
    };
    refresh();
    window.addEventListener("internet-notification", refresh);
    return () => window.removeEventListener("internet-notification", refresh);
  }, [load]);

  const text = query.trim().toLowerCase();
  const matches = useCallback(
    (values: (string | null)[]) =>
      !text ||
      values.filter(Boolean).some((value) => String(value).toLowerCase().includes(text)),
    [text]
  );

  const visibleStudents = useMemo(
    () =>
      students.filter(
        (student) =>
          (scope === "all" || student.missing.length > 0) &&
          matches([
            student.name,
            student.student_id,
            student.company,
            student.program,
            student.supervisor_name,
          ])
      ),
    [students, scope, matches]
  );

  const visibleDocuments = useMemo(
    () =>
      documents.filter(
        (item) =>
          (status === "all" || item.status === status) &&
          (!docType || item.doc_type === docType) &&
          isWithinDateRange(localDateKey(item.uploaded_at), dateFrom, dateTo) &&
          matches([
            item.student_name,
            item.student_id,
            item.company,
            item.supervisor_name,
            item.doc_type,
            item.original_filename,
          ])
      ),
    [documents, status, docType, dateFrom, dateTo, matches]
  );

  // The ZIP takes the filter bar, the status and the requirement. It is built
  // on the server from every matching file, not only the ones listed here.
  const downloadZip = async () => {
    const sent = new URLSearchParams(chosen);
    if (status !== "all") sent.set("status", status);
    if (docType) sent.set("doc_type", docType);
    setZipping(true);
    try {
      await downloadDocumentsZip(sent.toString());
      toast.success("ZIP ready. The download is recorded in the audit log.");
    } catch (zipError) {
      toast.error(errorText(zipError, "The ZIP could not be built."));
    } finally {
      setZipping(false);
    }
  };

  const studentPager = usePagination(visibleStudents, 20);
  const filePager = usePagination(visibleDocuments, 15);
  const total = requirements.length;
  const incomplete = students.filter((student) => student.missing.length > 0).length;

  const download = async (item: SubmittedDocument) => {
    try {
      await downloadSubmittedDocument(item.id, item.original_filename);
    } catch (downloadError) {
      toast.error(errorText(downloadError, "The document could not be downloaded."));
    }
  };

  return (
    <CoordinatorLayout
      title="Documents"
      subtitle="Which OJT requirements each student has completed, and every file submitted. Supervisors do the reviewing, except for deliverables set to be reviewed by you."
    >
      <div className="space-y-6">
        <FilterBar state={studentFilters} />
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        <SearchField
          value={query}
          onChange={setQuery}
          label="Search documents"
          placeholder="Search by student, company, supervisor or document"
          className="max-w-md"
        />

        <Card>
          <CardHeader
            title="Requirement progress"
            description={`A requirement is complete once the supervisor approves the student's file. ${total} active ${
              total === 1 ? "requirement" : "requirements"
            }.`}
          />
          <div className="space-y-3 border-b border-slate-100 px-4 pb-4 pt-3 sm:px-5">
            <FilterChips
              label="Which students"
              value={scope}
              onChange={setScope}
              options={[
                { value: "all", label: "All students", count: students.length },
                { value: "incomplete", label: "Incomplete", count: incomplete },
              ]}
            />
            <FilterChips
              label="How the students are listed"
              value={layout}
              onChange={setLayout}
              options={[
                { value: "students", label: "By student" },
                { value: "groups", label: "By college, program and block" },
              ]}
            />
          </div>
          {loading ? (
            <SkeletonRows rows={5} />
          ) : visibleStudents.length === 0 ? (
            <EmptyState
              icon={students.length === 0 ? "users" : "search"}
              title={students.length === 0 ? "No active students" : "No students match"}
            />
          ) : layout === "groups" ? (
            <DocumentGroups students={visibleStudents} total={total} />
          ) : (
            <>
            <ul className="divide-y divide-slate-100">
              {studentPager.pageItems.map((student) => (
                <li
                  key={student.student_id}
                  className="grid gap-x-6 gap-y-2 px-4 py-3.5 sm:px-5 lg:grid-cols-[minmax(0,16rem)_12rem_minmax(0,1fr)] lg:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{student.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {student.company || "No company"} ·{" "}
                      {student.supervisor_name || "No supervisor"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <ProgressBar
                      value={(student.required ?? total) ? (student.approved / (student.required ?? total)) * 100 : 0}
                      label={`${student.approved} of ${student.required ?? total} approved`}
                    />
                    <span className="tabular shrink-0 text-sm text-slate-700">
                      {student.approved}/{student.required ?? total}
                    </span>
                  </div>
                  <div className="min-w-0 text-sm">
                    {student.missing.length === 0 ? (
                      <StatusBadge status="Complete" tone="good" />
                    ) : (
                      <p className="text-slate-600">
                        <span className="font-medium text-slate-800">Still needed:</span>{" "}
                        {student.missing.join(", ")}
                      </p>
                    )}
                    {(student.pending > 0 || student.rejected > 0) && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {[
                          student.pending > 0 && `${student.pending} with the supervisor`,
                          student.rejected > 0 && `${student.rejected} rejected`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <Pagination state={studentPager} noun="student" />
            </>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Submitted files"
            description={
              loading ? undefined : `${visibleDocuments.length} of ${documents.length} shown, newest first`
            }
          />
          <div className="space-y-3 border-b border-slate-100 px-4 pb-4 pt-3 sm:px-5">
            <FilterChips
              label="Filter by status"
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "All" },
                { value: "Pending", label: "With supervisor" },
                { value: "Approved", label: "Approved" },
                { value: "Rejected", label: "Rejected" },
              ]}
            />
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs font-medium text-slate-600">
                Requirement
                <select
                  value={docType}
                  onChange={(event) => setDocType(event.target.value)}
                  className="mt-1 block h-10 min-w-48 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-800 focus:border-psu-500 focus:outline-none"
                >
                  <option value="">All requirements</option>
                  {requirements.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              <Button variant="secondary" icon="download" busy={zipping} busyProcess="export" onClick={() => void downloadZip()}>
                {zipping ? "Building" : "Download as ZIP"}
              </Button>
            </div>
            <p className="text-xs text-slate-600">
              The ZIP holds every file that fits the filter bar at the top, the status and the requirement chosen
              here, up to 500 files or 500 MB. The search box and the dates do not narrow it. Each file is named
              with the student, the requirement and its original name.
            </p>
            <DateRangeFilter
              from={dateFrom}
              to={dateTo}
              onChange={(from, to) => {
                setDateFrom(from);
                setDateTo(to);
              }}
            />
          </div>
          {loading ? (
            <SkeletonRows rows={5} />
          ) : visibleDocuments.length === 0 ? (
            <EmptyState
              icon="document"
              title={documents.length === 0 ? "No documents submitted yet" : "No documents match"}
            />
          ) : (
            <>
            <ul className="divide-y divide-slate-100">
              {filePager.pageItems.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">
                      {item.doc_type}
                      <span className="font-normal text-slate-500">
                        {" "}
                        · {item.student_name || item.student_id}
                      </span>
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {item.original_filename} · {formatFileSize(Number(item.size_bytes))} ·{" "}
                      {formatDate(item.uploaded_at)} · Supervisor:{" "}
                      {item.supervisor_name || "unassigned"}
                    </p>
                    {item.review_notes && (
                      <p className="mt-1 text-sm text-slate-600">
                        <span className="font-medium">
                          {item.reviewer_role === "coordinator" ? "Reviewer's note:" : "Supervisor's note:"}
                        </span>{" "}
                        {item.review_notes}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2">
                    <StatusBadge
                      status={
                        item.status !== "Pending"
                          ? item.status
                          : item.reviewer_role === "coordinator"
                            ? "Waiting for you"
                            : "With supervisor"
                      }
                      tone={item.status === "Pending" ? "waiting" : undefined}
                    />
                    {/* A deliverable the coordinator reviews is decided here. */}
                    {item.status === "Pending" && item.reviewer_role === "coordinator" && (
                      <>
                        <Button size="sm" busy={deciding === item.id} onClick={() => void decide(item, true)}>
                          Approve<span className="sr-only"> {item.doc_type} from {item.student_name || item.student_id}</span>
                        </Button>
                        <Button size="sm" variant="secondary" disabled={deciding === item.id} onClick={() => setRejecting(item)}>
                          Reject<span className="sr-only"> {item.doc_type} from {item.student_name || item.student_id}</span>
                        </Button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => void download(item)}
                      aria-label={`Download ${item.original_filename}`}
                      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold text-psu-700 hover:bg-psu-50"
                    >
                      <Icon name="download" size={15} />
                      Download
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination state={filePager} noun="file" />
            </>
          )}
        </Card>
      </div>

      <Modal
        open={rejecting !== null}
        onClose={() => {
          if (deciding === null) setRejecting(null);
        }}
        title="Reject this file?"
        description={rejecting ? `${rejecting.doc_type} from ${rejecting.student_name || rejecting.student_id}` : undefined}
        locked={deciding !== null}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(null)} disabled={deciding !== null}>
              Keep it waiting
            </Button>
            <Button
              busy={deciding !== null}
              disabled={!reason.trim()}
              onClick={() => rejecting && void decide(rejecting, false, reason.trim())}
            >
              Reject
            </Button>
          </>
        }
      >
        <label htmlFor="reject-reason" className="mb-1.5 block text-sm font-medium text-slate-700">
          What should the student fix?
        </label>
        <textarea
          id="reject-reason"
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="field resize-none"
        />
        <p className="mt-1.5 text-xs text-slate-600">The student sees this and can upload again.</p>
      </Modal>
    </CoordinatorLayout>
  );
}
