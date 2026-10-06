import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ComplaintThread from "../../components/ComplaintThread";
import Icon from "../../components/Icon";
import Pagination from "../../components/Pagination";
import {
  Button,
  Card,
  EmptyState,
  ErrorNotice,
  FilterChips,
  FormError,
  Modal,
  SearchField,
  SkeletonRows,
  StatusBadge,
} from "../../components/ui";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import { downloadProtectedUpload } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { notifyDataChanged } from "../../lib/navCounts";
import { errorText, toast } from "../../lib/toast";
import { usePagination } from "../../lib/usePagination";
import { coordinatorRequest } from "./request";

type ComplaintStatus = "Pending" | "In Review" | "Resolved" | "Dismissed";

type Complaint = {
  id: number;
  student_id: string | null;
  filed_by_name: string | null;
  report_type: "student" | "supervisor";
  reported_student_name: string | null;
  /** Set when a supervisor's report is about one of their interns. */
  reported_student_id?: string | null;
  supervisor_name: string | null;
  company_name: string | null;
  category: string;
  description: string;
  evidence_url: string | null;
  status: ComplaintStatus;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
};

type Filter = "all" | ComplaintStatus;

function subjectOf(complaint: Complaint): string {
  if (complaint.report_type === "student") {
    const name = complaint.reported_student_name || "a student";
    return complaint.reported_student_id ? `${name} (${complaint.reported_student_id})` : name;
  }
  return [complaint.supervisor_name, complaint.company_name].filter(Boolean).join(", ") || "a supervisor";
}

export default function CoordinatorComplaints() {
  const [searchParams] = useSearchParams();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState(() => searchParams.get("q") || "");
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("status", filter);
    if (search.trim()) params.set("q", search.trim());
    try {
      const data = await coordinatorRequest<{ complaints: Complaint[] }>(
        `/api/coordinator/complaints?${params.toString()}`
      );
      setComplaints(data.complaints || []);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load complaints."));
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const pager = usePagination(complaints, 15);
  const opened = complaints.find((item) => item.id === openId) ?? null;
  const filtered = filter !== "all" || search.trim() !== "";

  return (
    <CoordinatorLayout
      title="Complaints"
      subtitle="Reports filed by students and supervisors. Record what was done about each one."
    >
      <div className="space-y-5">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        <div className="flex flex-wrap items-center gap-3">
          <SearchField
            value={search}
            onChange={setSearch}
            label="Search complaints"
            placeholder="Search by person, company or wording"
            className="w-full sm:w-80"
          />
          <FilterChips
            label="Filter by status"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "Pending", label: "New" },
              { value: "In Review", label: "In review" },
              { value: "Resolved", label: "Resolved" },
              { value: "Dismissed", label: "Dismissed" },
            ]}
          />
        </div>

        <Card>
          {loading ? (
            <SkeletonRows rows={4} />
          ) : complaints.length === 0 ? (
            <EmptyState
              icon={filtered ? "search" : "check-circle"}
              title={filtered ? "No complaints match" : "No complaints have been filed"}
            />
          ) : (
            <>
            <ul className="divide-y divide-slate-100">
              {pager.pageItems.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(item.id)}
                    className="flex w-full items-start gap-4 px-4 py-4 text-left first:rounded-t-xl last:rounded-b-xl hover:bg-slate-50 sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <p className="text-sm font-semibold text-slate-900">{item.category}</p>
                        <StatusBadge status={item.status === "Pending" ? "New" : item.status} tone={item.status === "Pending" ? "waiting" : undefined} />
                      </div>
                      <p className="mt-0.5 text-sm text-slate-600">About {subjectOf(item)}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.description}</p>
                      <p className="mt-1.5 text-xs text-slate-500">
                        Filed by {item.filed_by_name || item.student_id || "a supervisor"} ·{" "}
                        {formatDateTime(item.created_at)}
                      </p>
                    </div>
                    <Icon name="chevron-right" size={16} className="mt-1 shrink-0 text-slate-300" />
                  </button>
                </li>
              ))}
            </ul>
            <Pagination state={pager} noun="complaint" />
            </>
          )}
        </Card>
      </div>

      <ComplaintDialog
        key={opened?.id ?? "closed"}
        complaint={opened}
        onClose={() => setOpenId(null)}
        onSaved={() => {
          setOpenId(null);
          notifyDataChanged();
          void load();
        }}
      />
    </CoordinatorLayout>
  );
}

function ComplaintDialog({
  complaint,
  onClose,
  onSaved,
}: {
  complaint: Complaint | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [notes, setNotes] = useState(complaint?.resolution_notes || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<ComplaintStatus | null>(null);

  if (!complaint) return null;

  const closed = complaint.status === "Resolved" || complaint.status === "Dismissed";

  const decide = async (status: "In Review" | "Resolved" | "Dismissed") => {
    // Closing a complaint needs a record of what was done; the filer is told.
    if (status !== "In Review" && !notes.trim()) {
      setError(
        status === "Resolved"
          ? "Write what was done to resolve it before closing."
          : "Write why it is being dismissed before closing."
      );
      return;
    }
    setBusy(status);
    setError("");
    try {
      await coordinatorRequest(`/api/coordinator/complaints/${complaint.id}/resolve`, {
        method: "PATCH",
        body: { status, resolution_notes: notes.trim() },
      });
      toast.success(
        status === "In Review"
          ? "Marked as in review. The person who filed it has been notified."
          : `Complaint ${status.toLowerCase()}. The person who filed it has been notified.`
      );
      onSaved();
    } catch (saveError) {
      setError(errorText(saveError, "The complaint could not be updated."));
      setBusy(null);
    }
  };

  const downloadEvidence = async () => {
    if (!complaint.evidence_url) return;
    try {
      await downloadProtectedUpload(complaint.evidence_url, "coordinator");
    } catch (downloadError) {
      toast.error(errorText(downloadError, "The evidence file could not be downloaded."));
    }
  };

  return (
    <Modal
      open
      onClose={() => busy === null && onClose()}
      title={complaint.category}
      description={`About ${subjectOf(complaint)}`}
      locked={busy !== null}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy !== null}>
            Close
          </Button>
          {complaint.status === "Pending" && (
            <Button
              variant="secondary"
              onClick={() => void decide("In Review")}
              busy={busy === "In Review"}
              disabled={busy !== null}
            >
              Mark as in review
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => void decide("Dismissed")}
            busy={busy === "Dismissed"}
            disabled={busy !== null}
          >
            Dismiss
          </Button>
          <Button
            icon="check"
            onClick={() => void decide("Resolved")}
            busy={busy === "Resolved"}
            disabled={busy !== null}
          >
            {closed ? "Save as resolved" : "Resolve"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
          <StatusBadge status={complaint.status === "Pending" ? "New" : complaint.status} tone={complaint.status === "Pending" ? "waiting" : undefined} />
          <span>
            Filed by {complaint.filed_by_name || complaint.student_id || "a supervisor"} ·{" "}
            {formatDateTime(complaint.created_at)}
          </span>
        </div>

        <p className="whitespace-pre-line border-l-2 border-slate-200 pl-3 text-sm text-slate-800">
          {complaint.description}
        </p>

        {complaint.evidence_url && (
          <button
            type="button"
            onClick={() => void downloadEvidence()}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-psu-700 hover:underline"
          >
            <Icon name="download" size={15} />
            Download attached evidence
          </button>
        )}

        <div>
          <label
            htmlFor="resolution-notes"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Action taken
          </label>
          <textarea
            id="resolution-notes"
            rows={4}
            maxLength={2000}
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
              if (event.target.value.trim()) setError("");
            }}
            placeholder="What was done about this report? The person who filed it will see this."
            className="field resize-none"
          />
          {complaint.resolved_at && (
            <p className="mt-1 text-xs text-slate-500">
              Closed {formatDateTime(complaint.resolved_at)}
            </p>
          )}
        </div>

        <FormError message={error} />

        <div className="border-t border-slate-200 pt-4">
          <ComplaintThread complaintId={complaint.id} role="coordinator" />
        </div>
      </div>
    </Modal>
  );
}
