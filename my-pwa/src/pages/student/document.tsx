import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../../components/Icon";
import Tooltip from "../../components/Tooltip";
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  ProgressBar,
  SkeletonRows,
  Spinner,
  StatusBadge,
} from "../../components/ui";
import StudentLayout from "../../layouts/StudentLayout";
import { API_URL, withStudentAuth } from "../../lib/api";
import { formatFileSize, UPLOAD_ACCEPT, UPLOAD_HINT, uploadProblem } from "../../lib/files";
import { formatDate } from "../../lib/format";
import { errorText, toast } from "../../lib/toast";

type DocumentStatus = "Pending" | "Approved" | "Rejected";

type StudentDocument = {
  id: number;
  doc_type: string;
  original_filename: string;
  size_bytes: number | string;
  status: DocumentStatus;
  review_notes: string | null;
  uploaded_at: string;
};

type Requirement = { id: number; name: string; description: string | null };

const MAX_DOCUMENT_MB = 10;

/** What a requirement needs from the student right now. */
type RequirementState = "missing" | "rejected" | "pending" | "approved";

function stateOf(latest: StudentDocument | undefined): RequirementState {
  if (!latest) return "missing";
  if (latest.status === "Approved") return "approved";
  if (latest.status === "Rejected") return "rejected";
  return "pending";
}

export default function Documents() {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [documents, setDocuments] = useState<StudentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploadingType, setUploadingType] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement | null>(null);
  const targetType = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [requirementsResponse, documentsResponse] = await Promise.all([
        fetch(`${API_URL}/api/ojt-requirements`, withStudentAuth()),
        fetch(`${API_URL}/api/documents/student`, withStudentAuth()),
      ]);
      const requirementsData = await requirementsResponse.json().catch(() => ({}));
      const documentsData = await documentsResponse.json().catch(() => ({}));
      if (!requirementsResponse.ok) {
        throw new Error(requirementsData.message || "Could not load the OJT requirements.");
      }
      if (!documentsResponse.ok) {
        throw new Error(documentsData.message || "Could not load your documents.");
      }
      setRequirements(requirementsData.requirements || []);
      setDocuments(documentsData.documents || []);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load your documents."));
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

  // Documents arrive newest first, so the first one seen for a type is the
  // latest submission for that requirement.
  const latestByType = useMemo(() => {
    const map = new Map<string, StudentDocument>();
    for (const item of documents) {
      if (!map.has(item.doc_type)) map.set(item.doc_type, item);
    }
    return map;
  }, [documents]);

  const approved = requirements.filter(
    (item) => stateOf(latestByType.get(item.name)) === "approved"
  ).length;
  const needsAction = requirements.filter((item) => {
    const state = stateOf(latestByType.get(item.name));
    return state === "missing" || state === "rejected";
  }).length;

  const startUpload = (docType: string) => {
    targetType.current = docType;
    fileInput.current?.click();
  };

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const docType = targetType.current;
    event.target.value = "";
    if (!file || !docType) return;

    const problem = uploadProblem(file, MAX_DOCUMENT_MB);
    if (problem) {
      toast.error(problem);
      return;
    }

    const form = new FormData();
    form.append("file", file);
    form.append("doc_type", docType);
    setUploadingType(docType);
    try {
      const response = await fetch(
        `${API_URL}/api/documents`,
        withStudentAuth({ method: "POST", body: form })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "The document could not be uploaded.");
      }
      toast.success(`${docType} uploaded. Your supervisor will review it.`);
      await load();
    } catch (uploadError) {
      toast.error(errorText(uploadError, "The document could not be uploaded."));
    } finally {
      setUploadingType(null);
    }
  };

  const download = async (item: StudentDocument) => {
    try {
      const response = await fetch(
        `${API_URL}/api/documents/${item.id}/file`,
        withStudentAuth()
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "The document could not be downloaded.");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = window.document.createElement("a");
      link.href = objectUrl;
      link.download = item.original_filename;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (downloadError) {
      toast.error(errorText(downloadError, "The document could not be downloaded."));
    }
  };

  return (
    <StudentLayout
      title="Documents"
      subtitle="Upload each OJT requirement. Your supervisor reviews every file."
    >
      <input
        ref={fileInput}
        type="file"
        accept={UPLOAD_ACCEPT}
        onChange={upload}
        className="sr-only"
        aria-label="Choose a document to upload"
        tabIndex={-1}
      />

      <div className="space-y-5">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        {!loading && requirements.length > 0 && (
          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">
                {approved} of {requirements.length} requirements approved
              </p>
              <p className="text-sm text-slate-600">
                {needsAction === 0
                  ? "Nothing left to upload."
                  : `${needsAction} still ${needsAction === 1 ? "needs" : "need"} your upload.`}
              </p>
            </div>
            <ProgressBar
              value={(approved / requirements.length) * 100}
              className="mt-3"
              label="Requirements approved"
            />
          </Card>
        )}

        <Card>
          <CardHeader
            title="OJT requirements"
            description={`${UPLOAD_HINT}, up to ${MAX_DOCUMENT_MB} MB each`}
          />
          <div className="mt-3">
            {loading ? (
              <SkeletonRows rows={5} />
            ) : requirements.length === 0 ? (
              <EmptyState
                icon="document"
                title="No requirements yet"
                description="Your OJT coordinator has not set the required documents."
              />
            ) : (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {requirements.map((requirement) => {
                  const latest = latestByType.get(requirement.name);
                  return (
                    <RequirementRow
                      key={requirement.id}
                      requirement={requirement}
                      latest={latest}
                      uploading={uploadingType === requirement.name}
                      disabled={uploadingType !== null}
                      onUpload={() => startUpload(requirement.name)}
                      onDownload={download}
                    />
                  );
                })}
              </ul>
            )}
          </div>
        </Card>

        {!loading && documents.length > 0 && (
          <Card>
            <CardHeader
              title="Upload history"
              description="Every file you have submitted, newest first"
            />
            <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
              {documents.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 px-4 py-3 sm:px-5"
                >
                  <Icon name="document" className="shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {item.original_filename}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {item.doc_type} · {formatFileSize(Number(item.size_bytes))} ·{" "}
                      {formatDate(item.uploaded_at)}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                  <Tooltip label="Download" side="left">
                    <button
                      type="button"
                      onClick={() => void download(item)}
                      aria-label={`Download ${item.original_filename}`}
                      className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <Icon name="download" />
                    </button>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </StudentLayout>
  );
}

const STATE_ICON = {
  missing: { icon: "upload", className: "bg-slate-100 text-slate-500" },
  rejected: { icon: "alert", className: "bg-red-50 text-red-600" },
  pending: { icon: "clock", className: "bg-amber-50 text-amber-700" },
  approved: { icon: "check", className: "bg-emerald-50 text-emerald-700" },
} as const;

function RequirementRow({
  requirement,
  latest,
  uploading,
  disabled,
  onUpload,
  onDownload,
}: {
  requirement: Requirement;
  latest: StudentDocument | undefined;
  uploading: boolean;
  disabled: boolean;
  onUpload: () => void;
  onDownload: (item: StudentDocument) => void;
}) {
  const state = stateOf(latest);
  const mark = STATE_ICON[state];
  const canUpload = state === "missing" || state === "rejected";

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${mark.className}`}
        >
          <Icon name={mark.icon} size={17} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <p className="text-sm font-semibold text-slate-900">{requirement.name}</p>
            <StatusBadge
              status={
                state === "missing"
                  ? "Not uploaded"
                  : state === "pending"
                    ? "Under review"
                    : latest!.status
              }
              tone={state === "missing" ? "neutral" : undefined}
            />
          </div>
          {requirement.description && (
            <p className="mt-0.5 text-sm text-slate-600">{requirement.description}</p>
          )}
          {latest && (
            <button
              type="button"
              onClick={() => onDownload(latest)}
              className="mt-1 block max-w-full truncate text-left text-sm text-psu-700 hover:underline"
            >
              {latest.original_filename}
              <span className="text-slate-500"> · {formatDate(latest.uploaded_at)}</span>
            </button>
          )}
          {latest?.review_notes && (
            <p
              className={`mt-2 rounded-md px-2.5 py-1.5 text-sm ${
                state === "rejected"
                  ? "bg-red-50 text-red-800"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              <span className="font-semibold">Reviewer:</span> {latest.review_notes}
            </p>
          )}
        </div>
      </div>

      {canUpload && (
        <button
          type="button"
          onClick={onUpload}
          disabled={disabled}
          className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            state === "rejected"
              ? "bg-psu-700 text-white hover:bg-psu-800"
              : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {uploading ? <Spinner size={15} /> : <Icon name="upload" size={16} />}
          {uploading ? "Uploading" : state === "rejected" ? "Upload again" : "Upload"}
        </button>
      )}
    </li>
  );
}
