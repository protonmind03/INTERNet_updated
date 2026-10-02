import { useMemo, useState } from "react";
import Icon from "../../components/Icon";
import Pagination from "../../components/Pagination";
import {
  Card,
  EmptyState,
  ErrorNotice,
  FilterChips,
  Modal,
  SkeletonRows,
  StatusBadge,
} from "../../components/ui";
import SupervisorLayout from "../../layouts/SupervisorLayout";
import { formatFileSize } from "../../lib/files";
import { formatDate } from "../../lib/format";
import { useAccount } from "../../lib/session";
import { usePagination } from "../../lib/usePagination";
import { errorText, toast } from "../../lib/toast";
import ReviewDetail from "./ReviewDetail";
import { downloadDocument, useSupervisorWork, type DocumentEntry } from "./useSupervisorWork";

type Filter = "all" | "Pending" | "Approved" | "Rejected";

export default function SupervisorDocuments() {
  const supervisor = useAccount("supervisor");
  const work = useSupervisorWork(supervisor?.supervisor_id);
  const { documents, interns, loading } = work;

  const [filter, setFilter] = useState<Filter>("all");
  const [internId, setInternId] = useState("");
  const [reviewId, setReviewId] = useState<number | null>(null);

  const scoped = useMemo(
    () => (internId ? documents.filter((item) => item.student_id === internId) : documents),
    [documents, internId]
  );

  const counts = useMemo(
    () => ({
      all: scoped.length,
      Pending: scoped.filter((item) => item.status === "Pending").length,
      Approved: scoped.filter((item) => item.status === "Approved").length,
      Rejected: scoped.filter((item) => item.status === "Rejected").length,
    }),
    [scoped]
  );

  const visible = useMemo(
    () => (filter === "all" ? scoped : scoped.filter((item) => item.status === filter)),
    [scoped, filter]
  );

  const pager = usePagination(visible, 15);
  const reviewing = documents.find((item) => item.id === reviewId && item.status === "Pending");

  const download = async (item: DocumentEntry) => {
    try {
      await downloadDocument(item);
    } catch (error) {
      toast.error(errorText(error, "The document could not be downloaded."));
    }
  };

  return (
    <SupervisorLayout
      title="Documents"
      subtitle="OJT requirement files uploaded by your interns."
    >
      <div className="space-y-5">
        {work.error && <ErrorNotice message={work.error} onRetry={() => void work.reload()} />}

        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <FilterChips
              label="Filter documents"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All", count: counts.all },
                { value: "Pending", label: "To review", count: counts.Pending },
                { value: "Approved", label: "Approved", count: counts.Approved },
                { value: "Rejected", label: "Rejected", count: counts.Rejected },
              ]}
            />
          </div>
          {interns.length > 1 && (
            <label className="block w-full sm:w-56">
              <span className="sr-only">Intern</span>
              <select
                value={internId}
                onChange={(event) => setInternId(event.target.value)}
                className="field"
              >
                <option value="">All interns</option>
                {interns.map((intern) => (
                  <option key={intern.student_id} value={intern.student_id}>
                    {intern.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <Card>
          {loading ? (
            <SkeletonRows rows={5} />
          ) : visible.length === 0 ? (
            <EmptyState
              icon="document"
              title={documents.length === 0 ? "No documents yet" : "No documents here"}
              description={
                documents.length === 0
                  ? "Files appear here when your interns upload their requirements."
                  : undefined
              }
            />
          ) : (
            <>
            <ul className="divide-y divide-slate-100">
              {pager.pageItems.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                      <Icon name="document" size={17} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <p className="text-sm font-semibold text-slate-900">{item.doc_type}</p>
                        <StatusBadge
                          status={item.status === "Pending" ? "To review" : item.status}
                          tone={item.status === "Pending" ? "waiting" : undefined}
                        />
                      </div>
                      <p className="mt-0.5 text-sm text-slate-600">{item.student_name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {item.original_filename} · {formatFileSize(Number(item.size_bytes))} ·{" "}
                        {formatDate(item.uploaded_at)}
                      </p>
                      {item.review_notes && (
                        <p
                          className={`mt-2 rounded-md px-2.5 py-1.5 text-sm ${
                            item.status === "Rejected"
                              ? "bg-red-50 text-red-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          <span className="font-semibold">Your note:</span> {item.review_notes}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => void download(item)}
                      aria-label={`Download ${item.original_filename}`}
                      className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Icon name="download" size={16} />
                      Download
                    </button>
                    {item.status === "Pending" && (
                      <button
                        type="button"
                        onClick={() => setReviewId(item.id)}
                        className="inline-flex h-10 items-center rounded-lg bg-psu-700 px-4 text-sm font-semibold text-white hover:bg-psu-800"
                      >
                        Review
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <Pagination state={pager} noun="document" />
            </>
          )}
        </Card>
      </div>

      <Modal
        open={Boolean(reviewing)}
        onClose={() => setReviewId(null)}
        title={reviewing ? reviewing.student_name : ""}
        size="lg"
      >
        {reviewing && (
          <ReviewDetail
            item={{
              kind: "document",
              key: `document-${reviewing.id}`,
              waitingSince: reviewing.uploaded_at,
              entry: reviewing,
            }}
            work={work}
            onDecided={() => setReviewId(null)}
          />
        )}
      </Modal>
    </SupervisorLayout>
  );
}
