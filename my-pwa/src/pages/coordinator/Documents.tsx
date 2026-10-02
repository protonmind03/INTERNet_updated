import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CoordinatorLayout from "./CoordinatorLayout";
import { API_URL, withCoordinatorAuth } from "../../lib/api";
import { isWithinDateRange } from "../../lib/dateRange";
import DateRangeFilter from "../../components/DateRangeFilter";

type DocumentStatus = "Pending" | "Approved" | "Rejected";

type SubmittedDocument = {
  id: number;
  student_id: string;
  student_name: string | null;
  program: string | null;
  company: string | null;
  supervisor_name: string | null;
  doc_type: string;
  original_filename: string;
  size_bytes: number | string;
  status: DocumentStatus;
  review_notes: string | null;
  uploaded_at: string;
  reviewed_at: string | null;
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

const statusStyles: Record<DocumentStatus, string> = {
  Pending: "bg-amber-50 text-amber-600",
  Approved: "bg-emerald-50 text-emerald-600",
  Rejected: "bg-red-50 text-red-500",
};

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Local YYYY-MM-DD of a timestamp, for comparing with date inputs. */
function localDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export default function CoordinatorDocuments() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<SubmittedDocument[]>([]);
  const [students, setStudents] = useState<StudentProgress[]>([]);
  const [requirements, setRequirements] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | DocumentStatus>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(
          `${API_URL}/api/coordinator/documents`,
          withCoordinatorAuth()
        );
        if (response.status === 401) {
          navigate("/");
          return;
        }
        const data = await response.json();
        if (!response.ok) {
          setError(data.message || "Failed to load submitted documents.");
          return;
        }
        setDocuments(data.documents || []);
        setStudents(data.students || []);
        setRequirements(data.requirements || []);
      } catch {
        setError("Unable to connect to the server.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [navigate]);

  const handleDownload = async (item: SubmittedDocument) => {
    setError("");
    try {
      const response = await fetch(
        `${API_URL}/api/documents/${item.id}/file`,
        withCoordinatorAuth()
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to download document.");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = window.document.createElement("a");
      link.href = objectUrl;
      link.download = item.original_filename;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Failed to download document."
      );
    }
  };

  const needle = query.trim().toLowerCase();
  const matches = (values: (string | null)[]) =>
    !needle ||
    values
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle));

  const visibleStudents = students.filter(
    (s) =>
      (!onlyIncomplete || s.missing.length > 0) &&
      matches([s.name, s.student_id, s.company, s.program, s.supervisor_name])
  );

  const visibleDocuments = documents.filter(
    (d) =>
      (!status || d.status === status) &&
      isWithinDateRange(localDay(d.uploaded_at), dateFrom, dateTo) &&
      matches([
        d.student_name,
        d.student_id,
        d.company,
        d.supervisor_name,
        d.doc_type,
        d.original_filename,
      ])
  );

  const total = requirements.length;

  return (
    <CoordinatorLayout
      title="Student Documents"
      subtitle="See which OJT requirements each student has submitted and open the files"
      breadcrumb={["Coordinator", "Oversight", "Documents"]}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by student, ID, company, supervisor, or document"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 sm:max-w-sm"
          />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={onlyIncomplete}
              onChange={(e) => setOnlyIncomplete(e.target.checked)}
              className="rounded border-slate-300"
            />
            Only students with missing requirements
          </label>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </p>
        )}

        {/* REQUIREMENT PROGRESS PER STUDENT */}
        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">
              Requirement progress
            </h2>
            <p className="text-xs text-slate-400">
              A requirement counts as complete once the supervisor approves
              the student's document for it. {total} active requirement
              {total === 1 ? "" : "s"}.
            </p>
          </div>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Student</th>
                <th className="px-4 py-3 font-medium">Supervisor</th>
                <th className="px-4 py-3 font-medium">Approved</th>
                <th className="px-4 py-3 font-medium">In review</th>
                <th className="px-4 py-3 font-medium">Still missing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    Loading documents...
                  </td>
                </tr>
              )}
              {!loading && visibleStudents.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    No students match this filter.
                  </td>
                </tr>
              )}
              {!loading &&
                visibleStudents.map((s) => (
                  <tr key={s.student_id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{s.name}</p>
                      <p className="text-xs text-slate-400">
                        {s.program || "—"} · {s.company || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {s.supervisor_name || "Unassigned"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{
                              width: `${total ? (s.approved / total) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs text-slate-500">
                          {s.approved}/{total}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {s.pending > 0 ? `${s.pending} pending` : "—"}
                      {s.rejected > 0 && (
                        <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-500">
                          {s.rejected} rejected
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {s.missing.length === 0 ? (
                        <span className="text-sm text-emerald-500">Complete</span>
                      ) : (
                        s.missing.join(", ")
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>

        {/* SUBMITTED FILES */}
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">
                Submitted files
              </h2>
              <p className="text-xs text-slate-400">
                {visibleDocuments.length} of {documents.length} shown, newest
                first.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex gap-1.5">
                {(["", "Pending", "Approved", "Rejected"] as const).map((s) => (
                  <button
                    key={s || "all"}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                      status === s
                        ? "bg-indigo-600 text-white"
                        : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {s || "All"}
                  </button>
                ))}
              </div>
              <DateRangeFilter
                from={dateFrom}
                to={dateTo}
                onChange={(from, to) => {
                  setDateFrom(from);
                  setDateTo(to);
                }}
              />
            </div>
          </div>

          {!loading && visibleDocuments.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">
              {documents.length === 0
                ? "No documents have been submitted yet."
                : "No documents match these filters."}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {visibleDocuments.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {d.doc_type}{" "}
                      <span className="font-normal text-slate-400">
                        · {d.student_name || d.student_id}
                      </span>
                    </p>
                    <p className="text-xs text-slate-400">
                      {d.original_filename} · {formatSize(Number(d.size_bytes))}{" "}
                      · Uploaded {formatDate(d.uploaded_at)} · Supervisor:{" "}
                      {d.supervisor_name || "Unassigned"}
                    </p>
                    {d.review_notes && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        Review note: {d.review_notes}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[d.status]}`}
                    >
                      {d.status}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDownload(d)}
                      className="text-xs font-medium text-indigo-600 hover:underline"
                    >
                      Download
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </CoordinatorLayout>
  );
}
