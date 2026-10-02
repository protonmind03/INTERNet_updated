import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL, withSupervisorAuth } from "../../lib/api";

type ReviewStatus = "Pending" | "Approved" | "Rejected";

type ReviewDocument = {
  id: number;
  student_id: string;
  student_name: string;
  doc_type: string;
  original_filename: string;
  size_bytes: number | string;
  status: ReviewStatus;
  review_notes: string | null;
  uploaded_at: string;
};

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SupervisorDocuments() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<ReviewDocument[]>([]);
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadDocuments = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/documents/supervisor`,
        withSupervisorAuth()
      );
      const data = await response.json();
      if (response.status === 401) {
        localStorage.removeItem("supervisor");
        localStorage.removeItem("supervisor_id");
        localStorage.removeItem("supervisor_token");
        navigate("/");
        return;
      }
      if (!response.ok) {
        throw new Error(data.message || "Failed to load documents.");
      }
      setDocuments(data.documents || []);
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load documents."
      );
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (
      !localStorage.getItem("supervisor") ||
      !localStorage.getItem("supervisor_token")
    ) {
      localStorage.removeItem("supervisor");
      localStorage.removeItem("supervisor_id");
      localStorage.removeItem("supervisor_token");
      navigate("/");
      return;
    }
    void Promise.resolve().then(loadDocuments);
  }, [loadDocuments, navigate]);

  const handleDownload = async (item: ReviewDocument) => {
    setError("");
    try {
      const response = await fetch(
        `${API_URL}/api/documents/${item.id}/file`,
        withSupervisorAuth()
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

  const reviewDocument = async (
    item: ReviewDocument,
    status: "Approved" | "Rejected"
  ) => {
    const notes = (reviewNotes[item.id] || "").trim();
    if (status === "Rejected" && !notes) {
      setError("Enter a reason before rejecting the document.");
      return;
    }

    setSavingId(item.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `${API_URL}/api/documents/${item.id}/review`,
        withSupervisorAuth({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, review_notes: notes }),
        })
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to save document review.");
      }
      setMessage(`${item.doc_type} marked ${status.toLowerCase()}.`);
      await loadDocuments();
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : "Failed to save document review."
      );
    } finally {
      setSavingId(null);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-5xl">
        <button
          type="button"
          onClick={() => navigate("/supervisor/dashboard")}
          className="mb-5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          ← Back to dashboard
        </button>
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
            Supervisor Portal
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            Student documents
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Review files submitted by your assigned interns.
          </p>
        </header>

        {error && (
          <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
            {message}
          </p>
        )}

        <section className="space-y-4">
          {loading ? (
            <p className="rounded-xl border bg-white p-6 text-sm text-slate-500">
              Loading submitted documents...
            </p>
          ) : documents.length === 0 ? (
            <p className="rounded-xl border bg-white p-6 text-sm text-slate-500">
              No documents have been submitted by your interns.
            </p>
          ) : (
            documents.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {item.doc_type}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      {item.student_name} · {item.student_id}
                    </p>
                    <p className="mt-1 break-all text-xs text-slate-500">
                      {item.original_filename} · {formatSize(Number(item.size_bytes))} ·{" "}
                      {new Date(item.uploaded_at).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      item.status === "Approved"
                        ? "bg-emerald-50 text-emerald-700"
                        : item.status === "Rejected"
                          ? "bg-red-50 text-red-700"
                          : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {item.status}
                  </span>
                </div>

                {item.review_notes && (
                  <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                    Review note: {item.review_notes}
                  </p>
                )}

                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => void handleDownload(item)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Download document
                  </button>
                  {item.status === "Pending" && (
                    <>
                      <input
                        aria-label={`Review note for ${item.doc_type}`}
                        value={reviewNotes[item.id] || ""}
                        onChange={(event) =>
                          setReviewNotes((current) => ({
                            ...current,
                            [item.id]: event.target.value,
                          }))
                        }
                        placeholder="Optional note; required for rejection"
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        disabled={savingId === item.id}
                        onClick={() => void reviewDocument(item, "Approved")}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={savingId === item.id}
                        onClick={() => void reviewDocument(item, "Rejected")}
                        className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
