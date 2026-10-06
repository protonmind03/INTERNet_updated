import { useCallback, useEffect, useMemo, useState } from "react";
import DateRangeFilter from "../../components/DateRangeFilter";
import Icon from "../../components/Icon";
import Pagination from "../../components/Pagination";
import {
  Card,
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
import { coordinatorRequest, downloadSubmittedDocument } from "./request";

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
};

type StudentProgress = {
  student_id: string;
  name: string;
  program: string | null;
  company: string | null;
  supervisor_name: string | null;
  approved: number;
  pending: number;
  rejected: number;
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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await coordinatorRequest<{
        documents: SubmittedDocument[];
        students: StudentProgress[];
        requirements: string[];
      }>("/api/coordinator/documents");
      setDocuments(data.documents || []);
      setStudents(data.students || []);
      setRequirements(data.requirements || []);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load submitted documents."));
    } finally {
      setLoading(false);
    }
  }, []);

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
    [documents, status, dateFrom, dateTo, matches]
  );

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
      subtitle="Which OJT requirements each student has completed, and every file submitted. Supervisors do the reviewing."
    >
      <div className="space-y-6">
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
          <div className="border-b border-slate-100 px-4 pb-4 pt-3 sm:px-5">
            <FilterChips
              label="Which students"
              value={scope}
              onChange={setScope}
              options={[
                { value: "all", label: "All students", count: students.length },
                { value: "incomplete", label: "Incomplete", count: incomplete },
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
                      value={total ? (student.approved / total) * 100 : 0}
                      label={`${student.approved} of ${total} approved`}
                    />
                    <span className="tabular shrink-0 text-sm text-slate-700">
                      {student.approved}/{total}
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
                        <span className="font-medium">Supervisor's note:</span> {item.review_notes}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <StatusBadge
                      status={item.status === "Pending" ? "With supervisor" : item.status}
                      tone={item.status === "Pending" ? "waiting" : undefined}
                    />
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
    </CoordinatorLayout>
  );
}
