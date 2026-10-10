import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../../components/Icon";
import {
  Button,
  Card,
  EmptyState,
  ErrorNotice,
  FilterChips,
  Modal,
  Skeleton,
  StatusBadge,
} from "../../components/ui";
import StudentLayout from "../../layouts/StudentLayout";
import { API_URL, downloadProtectedUpload, withStudentAuth } from "../../lib/api";
import { formatFileSize, UPLOAD_ACCEPT, UPLOAD_HINT, uploadProblem } from "../../lib/files";
import { daysUntil, dueLabel, formatDate, formatDateTime } from "../../lib/format";
import { notifyDataChanged } from "../../lib/navCounts";
import { savedFetch } from "../../lib/offlineStore";
import { useAccount } from "../../lib/session";
import { errorText, toast } from "../../lib/toast";
import { useDraft } from "../../lib/useDraft";

type TaskStatus = "Pending" | "In Progress" | "Submitted" | "Reviewed";
type Priority = "High" | "Medium" | "Low";

type Task = {
  id: number;
  title: string;
  description: string | null;
  assigned_by: string | null;
  priority: Priority | null;
  status: TaskStatus;
  due_date: string | null;
  created_at: string;
  submission_notes?: string | null;
  submission_file?: string | null;
  submitted_at?: string | null;
  review_notes?: string | null;
  review_rating?: number | null;
  reviewed_at?: string | null;
  /** A file the supervisor attached when assigning the task. */
  attachment_file?: string | null;
  attachment_name?: string | null;
};

type Filter = "todo" | "submitted" | "reviewed" | "all";

const isOpen = (task: Task) => task.status === "Pending" || task.status === "In Progress";

const MAX_ATTACHMENT_MB = 5;

export default function MyTasks() {
  const student = useAccount("student");
  const studentId = student?.student_id;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("todo");
  const [submitting, setSubmitting] = useState<Task | null>(null);

  const load = useCallback(async () => {
    if (!studentId) return;
    try {
      const response = await savedFetch(
        "student",
        "tasks",
        `${API_URL}/api/tasks/student/${encodeURIComponent(studentId)}`,
        withStudentAuth()
      );
      if (!response.ok) throw new Error("Could not load your tasks.");
      const data = await response.json();
      setTasks(Array.isArray(data) ? (data as Task[]) : []);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load your tasks."));
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    const refresh = () => {
      void load();
    };
    refresh();
    window.addEventListener("internet-notification", refresh);
    return () => window.removeEventListener("internet-notification", refresh);
  }, [load]);

  const counts = useMemo(
    () => ({
      todo: tasks.filter(isOpen).length,
      submitted: tasks.filter((task) => task.status === "Submitted").length,
      reviewed: tasks.filter((task) => task.status === "Reviewed").length,
      all: tasks.length,
    }),
    [tasks]
  );

  const visible = useMemo(() => {
    const list = tasks.filter((task) => {
      if (filter === "todo") return isOpen(task);
      if (filter === "submitted") return task.status === "Submitted";
      if (filter === "reviewed") return task.status === "Reviewed";
      return true;
    });
    // Open work first, soonest deadline on top; finished work newest first.
    return list.sort((a, b) => {
      if (isOpen(a) !== isOpen(b)) return isOpen(a) ? -1 : 1;
      const left = a.due_date ? new Date(a.due_date).getTime() : Infinity;
      const right = b.due_date ? new Date(b.due_date).getTime() : Infinity;
      return isOpen(a) ? left - right : right - left;
    });
  }, [tasks, filter]);

  const download = async (filePath: string, name?: string | null) => {
    try {
      await downloadProtectedUpload(filePath, "student", name);
    } catch (downloadError) {
      toast.error(errorText(downloadError, "The attachment could not be downloaded."));
    }
  };

  return (
    <StudentLayout title="Tasks" subtitle="Work assigned by your company supervisor.">
      <div className="space-y-4">
        {error && <ErrorNotice message={error} onRetry={() => void load()} />}

        <FilterChips
          label="Filter tasks"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "todo", label: "To do", count: counts.todo },
            { value: "submitted", label: "Submitted", count: counts.submitted },
            { value: "reviewed", label: "Reviewed", count: counts.reviewed },
            { value: "all", label: "All", count: counts.all },
          ]}
        />

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((row) => (
              <Card key={row} className="space-y-3 p-5">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3.5 w-4/5" />
                <Skeleton className="h-3.5 w-1/3" />
              </Card>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <Card>
            <EmptyState
              icon="tasks"
              title={
                tasks.length === 0
                  ? "No tasks yet"
                  : filter === "todo"
                    ? "Nothing to do right now"
                    : "No tasks here"
              }
              description={
                tasks.length === 0
                  ? "Tasks your supervisor assigns will appear here."
                  : filter === "todo"
                    ? "You have submitted every task assigned to you."
                    : undefined
              }
            />
          </Card>
        ) : (
          <ul className="space-y-3">
            {visible.map((task) => (
              <li key={task.id}>
                <TaskCard
                  task={task}
                  onSubmit={() => setSubmitting(task)}
                  onDownload={download}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <SubmitDialog
        task={submitting}
        onClose={() => setSubmitting(null)}
        onSubmitted={() => {
          setSubmitting(null);
          setFilter("submitted");
          notifyDataChanged();
          void load();
        }}
      />
    </StudentLayout>
  );
}

function TaskCard({
  task,
  onSubmit,
  onDownload,
}: {
  task: Task;
  onSubmit: () => void;
  onDownload: (filePath: string, name?: string | null) => void;
}) {
  const open = isOpen(task);
  const days = daysUntil(task.due_date);
  const late = open && days !== null && days < 0;
  const soon = open && days !== null && days >= 0 && days <= 2;

  return (
    <Card className={`p-4 sm:p-5 ${late ? "border-red-200" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <h2 className="min-w-0 flex-1 text-base font-semibold text-slate-900">
          {task.title}
        </h2>
        <StatusBadge
          status={
            late
              ? "Overdue"
              : open && task.review_notes
                ? "Needs changes"
                : open
                  ? "To do"
                  : task.status
          }
          tone={late ? "bad" : open && task.review_notes ? "waiting" : open ? "neutral" : undefined}
        />
      </div>

      {task.description && (
        <p className="mt-1.5 whitespace-pre-line text-sm text-slate-600">
          {task.description}
        </p>
      )}

      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <Meta icon="calendar">
          <span
            className={
              late
                ? "font-semibold text-red-600"
                : soon
                  ? "font-semibold text-amber-700"
                  : "text-slate-600"
            }
          >
            {open ? dueLabel(task.due_date) : `Due ${formatDate(task.due_date)}`}
          </span>
          {open && task.due_date && (
            <span className="text-slate-400"> · {formatDate(task.due_date)}</span>
          )}
        </Meta>
        {task.assigned_by && <Meta icon="user">{task.assigned_by}</Meta>}
        {task.priority && <Meta icon="flag">{task.priority} priority</Meta>}
      </dl>

      {task.attachment_file && (
        <button
          type="button"
          onClick={() => onDownload(task.attachment_file!, task.attachment_name)}
          className="mt-3 flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3.5 py-2.5 text-left hover:border-psu-300 hover:bg-psu-50 sm:w-auto sm:max-w-md"
        >
          <Icon name="document" className="shrink-0 text-psu-600" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-800">
              {task.attachment_name || "Attached file"}
            </span>
            <span className="block text-xs text-slate-500">From your supervisor</span>
          </span>
          <Icon name="download" size={16} className="shrink-0 text-slate-400" />
        </button>
      )}

      {/* Sent back by the supervisor: say why before offering to resubmit. */}
      {open && task.review_notes && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
          <p className="text-xs font-medium text-amber-900">
            Your supervisor asked for changes
            {task.reviewed_at && ` · ${formatDateTime(task.reviewed_at)}`}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm text-amber-950">
            {task.review_notes}
          </p>
        </div>
      )}

      {open && (
        <div className="mt-4">
          <Button icon="upload" onClick={onSubmit}>
            {task.review_notes ? "Submit again" : "Submit work"}
          </Button>
        </div>
      )}

      {(task.submission_notes || task.submission_file) && !open && (
        <div className="mt-4 rounded-lg bg-slate-50 px-3.5 py-3">
          <p className="text-xs font-medium text-slate-500">
            Your submission
            {task.submitted_at && ` · ${formatDateTime(task.submitted_at)}`}
          </p>
          {task.submission_notes && (
            <p className="mt-1 whitespace-pre-line text-sm text-slate-700">
              {task.submission_notes}
            </p>
          )}
          {task.submission_file && (
            <button
              type="button"
              onClick={() => onDownload(task.submission_file!)}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-psu-700 hover:underline"
            >
              <Icon name="download" size={15} />
              Download attachment
            </button>
          )}
        </div>
      )}

      {task.status === "Submitted" && (
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
          <Icon name="clock" size={16} className="text-amber-600" />
          Waiting for your supervisor to review.
        </p>
      )}

      {task.status === "Reviewed" && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-emerald-800">
              Supervisor's review
              {task.reviewed_at && ` · ${formatDateTime(task.reviewed_at)}`}
            </p>
            {typeof task.review_rating === "number" && task.review_rating > 0 && (
              <Rating value={task.review_rating} />
            )}
          </div>
          <p className="mt-1 whitespace-pre-line text-sm text-emerald-900">
            {task.review_notes || "Reviewed with no written feedback."}
          </p>
        </div>
      )}
    </Card>
  );
}

function Meta({
  icon,
  children,
}: {
  icon: "calendar" | "user" | "flag";
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 text-slate-600">
      <Icon name={icon} size={15} className="shrink-0 text-slate-400" />
      <span>{children}</span>
    </div>
  );
}

function Rating({ value }: { value: number }) {
  const stars = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span
      className="flex items-center gap-0.5"
      role="img"
      aria-label={`Rated ${stars} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Icon
          key={star}
          name="star"
          size={15}
          className={star <= stars ? "fill-gold-400 text-gold-500" : "text-emerald-300"}
        />
      ))}
    </span>
  );
}

/*
|--------------------------------------------------------------------------
| SUBMIT WORK
|--------------------------------------------------------------------------
*/

function SubmitDialog({
  task,
  onClose,
  onSubmitted,
}: {
  task: Task | null;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [notes, setNotes] = useState("");
  // Kept per task, so a note for one task never appears on another.
  const discardNotes = useDraft("student", task ? `task-note:${task.id}` : null, notes, setNotes);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const reset = () => {
    setNotes("");
    setFile(null);
    setError("");
  };

  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const chooseFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (!chosen) return;
    const problem = uploadProblem(chosen, MAX_ATTACHMENT_MB);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setFile(chosen);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!task) return;
    if (!notes.trim() && !file) {
      setError("Describe what you completed, or attach a file.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const form = new FormData();
      form.append("submission_notes", notes.trim());
      if (file) form.append("attachment", file);
      const response = await fetch(
        `${API_URL}/api/tasks/${task.id}/submit`,
        withStudentAuth({ method: "POST", body: form })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "Your work could not be submitted.");
      }
      toast.celebrate("Work submitted. Your supervisor has been notified.");
      discardNotes();
      reset();
      onSubmitted();
    } catch (submitError) {
      setError(errorText(submitError, "Your work could not be submitted."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={task !== null}
      onClose={close}
      title="Submit work"
      description={task?.title}
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="submit-task-form" busy={saving} failed={Boolean(error)} busyProcess="taskSubmit" icon="upload">
            {saving ? "Submitting" : "Submit"}
          </Button>
        </>
      }
    >
      <form id="submit-task-form" onSubmit={submit} className="space-y-4">
        <div>
          <label
            htmlFor="submission-notes"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            What did you complete?
          </label>
          <textarea
            id="submission-notes"
            rows={4}
            maxLength={2000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Summarise the work you did for this task."
            className="field resize-none"
          />
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">
            Attachment <span className="font-normal text-slate-400">(optional)</span>
          </p>
          <input
            ref={fileInput}
            type="file"
            accept={UPLOAD_ACCEPT}
            onChange={chooseFile}
            className="sr-only"
            aria-label="Attachment"
          />
          {file ? (
            <div className="flex items-center gap-3 rounded-lg border border-slate-300 px-3 py-2.5">
              <Icon name="document" className="shrink-0 text-psu-600" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
                <p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                disabled={saving}
                aria-label="Remove attachment"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex w-full items-center gap-3 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-left hover:border-psu-400 hover:bg-psu-50"
            >
              <Icon name="upload" className="shrink-0 text-slate-400" />
              <span className="text-sm">
                <span className="font-semibold text-psu-700">Choose a file</span>
                <span className="block text-xs text-slate-500">
                  {UPLOAD_HINT}, up to {MAX_ATTACHMENT_MB} MB
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
      </form>
    </Modal>
  );
}
