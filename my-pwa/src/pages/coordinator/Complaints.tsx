import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import CoordinatorLayout from "./CoordinatorLayout";
import {
  API_URL,
  downloadProtectedUpload,
  withCoordinatorAuth,
} from "../../lib/api";

type Complaint = {
  id: number;
  student_id: string;
  filed_by_name: string | null;
  report_type: "student" | "supervisor";
  reported_student_name: string | null;
  supervisor_name: string | null;
  company_name: string | null;
  category: string;
  description: string;
  evidence_url: string | null;
  status: "Pending" | "In Review" | "Resolved" | "Dismissed";
  resolved_by: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
};

const STATUS_STYLES: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-600",
  "In Review": "bg-blue-50 text-blue-600",
  Resolved: "bg-emerald-50 text-emerald-600",
  Dismissed: "bg-slate-100 text-slate-500",
};

export default function CoordinatorComplaints() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState(() => searchParams.get("q") || "");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const [active, setActive] = useState<Complaint | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [evidenceError, setEvidenceError] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (search.trim()) params.set("q", search.trim());

      const response = await fetch(
        `${API_URL}/api/coordinator/complaints?${params.toString()}`,
        withCoordinatorAuth()
      );

      if (response.status === 401) {
        navigate("/");
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Failed to load complaints.");
        return;
      }

      setComplaints(data.complaints || []);
    } catch {
      setError("Unable to connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeout = window.setTimeout(load, 250);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  const openDetail = (c: Complaint) => {
    setActive(c);
    setNotes(c.resolution_notes || "");
    setEvidenceError("");
  };

  const downloadEvidence = async (filePath: string) => {
    setEvidenceError("");
    try {
      await downloadProtectedUpload(filePath, "coordinator");
    } catch (error) {
      setEvidenceError(
        error instanceof Error
          ? error.message
          : "Unable to download attached evidence."
      );
    }
  };

  const resolve = async (status: "In Review" | "Resolved" | "Dismissed") => {
    if (!active) return;

    try {
      setSaving(true);

      const response = await fetch(
        `${API_URL}/api/coordinator/complaints/${active.id}/resolve`,
        withCoordinatorAuth({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, resolution_notes: notes }),
        })
      );

      if (response.ok) {
        setActive(null);
        load();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <CoordinatorLayout
      title="Complaints & Incidents"
      subtitle="Review filed reports and record how each one was resolved"
      breadcrumb={["Coordinator", "Oversight", "Complaints"]}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            maxLength={100}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search complaints"
            placeholder="Search complaints, student, company, or date..."
            className="w-72 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none"
          />
          <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
            {["", "Pending", "In Review", "Resolved", "Dismissed"].map((s) => (
              <button
                key={s || "all"}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  statusFilter === s
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {s || "All"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2.5">
          {loading && (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
              Loading complaints...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-red-200 bg-white p-8 text-center text-sm text-red-400">
              {error}
            </div>
          )}

          {!loading && !error && complaints.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
              No complaints found.
            </div>
          )}

          {!loading &&
            !error &&
            complaints.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => openDetail(c)}
                className="block w-full rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-indigo-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {c.category}
                      <span className="ml-2 text-xs font-normal text-slate-400">
                        {c.report_type === "student"
                          ? `about ${c.reported_student_name || "a student"}`
                          : `about ${c.supervisor_name || "a supervisor"}`}
                      </span>
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                      {c.description}
                    </p>
                    <p className="mt-1.5 text-xs text-slate-400">
                      Filed by {c.filed_by_name || c.student_id} ·{" "}
                      {new Date(c.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      STATUS_STYLES[c.status] || "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
              </button>
            ))}
        </div>
      </div>

      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {active.category}
                </h2>
                <p className="text-xs text-slate-400">
                  Filed {new Date(active.created_at).toLocaleString()}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  STATUS_STYLES[active.status]
                }`}
              >
                {active.status}
              </span>
            </div>

            <p className="mt-4 text-sm text-slate-600">
              {active.description}
            </p>

            {active.evidence_url && (
              <button
                type="button"
                onClick={() => void downloadEvidence(active.evidence_url!)}
                className="mt-3 inline-block text-xs font-medium text-indigo-600 hover:underline"
              >
                Download attached evidence
              </button>
            )}
            {evidenceError && (
              <p role="alert" className="mt-2 text-xs text-red-600">
                {evidenceError}
              </p>
            )}

            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Resolution notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="What action was taken?"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setActive(null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => resolve("In Review")}
                className="rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-60"
              >
                Mark In Review
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => resolve("Dismissed")}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              >
                Dismiss
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => resolve("Resolved")}
                className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Mark Resolved"}
              </button>
            </div>
          </div>
        </div>
      )}
    </CoordinatorLayout>
  );
}
