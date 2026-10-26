import { SummaryTiles } from "../../components/display";
import { useMemo, useState, type ReactNode } from "react";
import Icon from "../../components/Icon";
import InternPanels from "../../components/InternPanels";
import { panelsByIntern } from "../../lib/internPanels";
import {
  Card,
  EmptyState,
  ErrorNotice,
  Modal,
  SkeletonRows,
  StatusBadge,
} from "../../components/ui";
import SupervisorLayout from "../../layouts/SupervisorLayout";
import { formatFileSize } from "../../lib/files";
import { formatDate } from "../../lib/format";
import { useAccount } from "../../lib/session";
import { recordId, useFocusRecord } from "../../lib/useFocusRecord";
import { errorText, toast } from "../../lib/toast";
import ReviewDetail from "./ReviewDetail";
import RequirementGrid from "./RequirementGrid";
import { downloadDocument, useSupervisorWork, type DocumentEntry } from "./useSupervisorWork";
import InternGroupSelect from "./InternGroups";
import { useInternGroups } from "./useInternGroups";
import { sameId } from "../../lib/ids";

type Filter = "all" | "Pending" | "Approved" | "Rejected";

export default function SupervisorDocuments() {
  const supervisor = useAccount("supervisor");
  const work = useSupervisorWork(supervisor?.supervisor_id, ["interns", "documents"]);
  const { documents, interns, loading } = work;

  const [filter, setFilter] = useState<Filter>("all");
  const [internId, setInternId] = useState("");
  // Interns of more than one program or block can be narrowed to one.
  const grouping = useInternGroups();
  const inGroup = grouping.has;
  const [reviewId, setReviewId] = useState<number | null>(null);

  const scoped = useMemo(
    () =>
      (internId ? documents.filter((item) => sameId(item.student_id, internId)) : documents).filter((item) =>
        inGroup(item.student_id)
      ),
    [documents, internId, inGroup]
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

  // A notification about one file opens its intern's panel and points at it.
  const focus = useFocusRecord(!loading);
  const focusedFile = focus?.startsWith("document-") ? documents.find((item) => String(item.id) === focus.slice(9)) : undefined;
  const panels = useMemo(
    () =>
      panelsByIntern(visible, {
        student: (item) => ({ id: item.student_id, name: item.student_name }),
        waitingSince: (item) => (item.status === "Pending" ? item.uploaded_at : null),
        block: grouping.blockOf,
      }),
    [visible, grouping.blockOf]
  );
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
            <div className="w-full">
              <SummaryTiles
                label="Filter documents"
                value={filter}
                onChange={setFilter}
                tiles={[
                  { value: "all", label: "All", count: counts.all, icon: "list", tone: "brand" },
                  { value: "Pending", label: "To review", count: counts.Pending, icon: "inbox", tone: (counts.Pending) > 0 ? "warning" : "neutral" },
                  { value: "Approved", label: "Approved", count: counts.Approved, icon: "check-circle", tone: "success" },
                  { value: "Rejected", label: "Rejected", count: counts.Rejected, icon: "refresh", tone: (counts.Rejected) > 0 ? "danger" : "neutral" },
                ]}
              />
            </div>
          </div>
          <InternGroupSelect state={grouping} onChange={() => setInternId("")} />
          {interns.length > 1 && (
            <label className="block w-full sm:w-56">
              <span className="sr-only">Intern</span>
              <select
                value={internId}
                onChange={(event) => setInternId(event.target.value)}
                className="field"
              >
                <option value="">All interns</option>
                {interns.filter((intern) => inGroup(intern.student_id)).map((intern) => (
                  <option key={intern.student_id} value={intern.student_id}>
                    {intern.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {!loading && (
          <RequirementGrid
            documents={scoped}
            interns={interns.filter((intern) => inGroup(intern.student_id) && (!internId || sameId(intern.student_id, internId)))}
            onReview={setReviewId}
            onDownload={(item) => void download(item)}
          />
        )}

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
            <InternPanels
              panels={panels}
              waitingLabel="to review"
              focusStudentId={focusedFile?.student_id}
              renderItems={(items) => (
                <FileGroups
                  items={items}
                  focusedId={focusedFile?.id}
                  render={(item) => (
                    <li
                      key={item.id}
                      id={recordId("document", item.id)}
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
                  )}
                />
              )}
            />
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

/**
 * One intern's files: what needs a look (waiting or rejected) in view, the approved ones
 * folded under one line (sv10-26), opened when a notification points at one of them.
 */
function FileGroups({ items, focusedId, render }: { items: DocumentEntry[]; focusedId?: number; render: (item: DocumentEntry) => ReactNode }) {
  const attention = items.filter((item) => item.status !== "Approved");
  const approved = items.filter((item) => item.status === "Approved");
  if (attention.length === 0 || approved.length === 0) return <ul className="divide-y divide-slate-100">{items.map(render)}</ul>;
  return (
    <>
      <ul className="divide-y divide-slate-100">{attention.map(render)}</ul>
      <details className="group border-t border-slate-100" open={approved.some((item) => item.id === focusedId)}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold text-psu-700 hover:bg-slate-50 sm:px-5 [&::-webkit-details-marker]:hidden">
          <Icon name="chevron-right" size={16} className="transition-transform group-open:rotate-90" />
          Show {approved.length} approved {approved.length === 1 ? "file" : "files"}
        </summary>
        <ul className="divide-y divide-slate-100 border-t border-slate-100">{approved.map(render)}</ul>
      </details>
    </>
  );
}
