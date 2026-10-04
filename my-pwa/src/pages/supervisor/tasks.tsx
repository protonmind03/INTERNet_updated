import { useMemo, useRef, useState } from "react";
import Icon from "../../components/Icon";
import Pagination from "../../components/Pagination";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorNotice,
  FilterChips,
  Modal,
  SkeletonRows,
  Stars,
  StatusBadge,
} from "../../components/ui";
import SupervisorLayout from "../../layouts/SupervisorLayout";
import { API_URL, downloadProtectedUpload, withSupervisorAuth } from "../../lib/api";
import { formatFileSize, UPLOAD_ACCEPT, UPLOAD_HINT, uploadProblem } from "../../lib/files";
import { daysUntil, dueLabel, formatDate, localDateKey } from "../../lib/format";
import { notifyDataChanged } from "../../lib/navCounts";
import { useAccount } from "../../lib/session";
import { errorText, toast } from "../../lib/toast";
import { usePagination } from "../../lib/usePagination";
import ReviewDetail from "./ReviewDetail";
import {
  useSupervisorWork,
  type Intern,
  type TaskEntry,
} from "./useSupervisorWork";

type Filter = "all" | "open" | "Submitted" | "Reviewed";

const isOpen = (task: TaskEntry) => task.status === "Pending" || task.status === "In Progress";

const MAX_ATTACHMENT_MB = 5;

async function downloadAttachment(task: TaskEntry) {
  if (!task.attachment_file) return;
  try {
    await downloadProtectedUpload(task.attachment_file, "supervisor", task.attachment_name);
  } catch (downloadError) {
    toast.error(errorText(downloadError, "The attachment could not be downloaded."));
  }
}

export default function SupervisorTasks() {
  const supervisor = useAccount("supervisor");
  const work = useSupervisorWork(supervisor?.supervisor_id);
  const { tasks, interns, loading } = work;

  const [filter, setFilter] = useState<Filter>("all");
  const [internId, setInternId] = useState("");
  // "new" while assigning, a task while editing one, null when closed.
  const [form, setForm] = useState<TaskEntry | "new" | null>(null);
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState<TaskEntry | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  const scoped = useMemo(
    () => (internId ? tasks.filter((task) => task.student_id === internId) : tasks),
    [tasks, internId]
  );

  const counts = useMemo(
    () => ({
      all: scoped.length,
      open: scoped.filter(isOpen).length,
      Submitted: scoped.filter((task) => task.status === "Submitted").length,
      Reviewed: scoped.filter((task) => task.status === "Reviewed").length,
    }),
    [scoped]
  );

  const visible = useMemo(
    () =>
      scoped.filter((task) =>
        filter === "all" ? true : filter === "open" ? isOpen(task) : task.status === filter
      ),
    [scoped, filter]
  );
  const pager = usePagination(visible, 15);

  const reviewing = tasks.find((task) => task.id === reviewId && task.status === "Submitted");

  const cancelTask = async () => {
    if (!cancelling) return;
    setCancelBusy(true);
    try {
      const response = await fetch(
        `${API_URL}/api/tasks/${cancelling.id}`,
        withSupervisorAuth({ method: "DELETE" })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "The task could not be cancelled.");
      toast.success(`Task cancelled. ${cancelling.student_name} has been notified.`);
      setCancelling(null);
      notifyDataChanged();
      await work.reload();
    } catch (cancelError) {
      toast.error(errorText(cancelError, "The task could not be cancelled."));
    } finally {
      setCancelBusy(false);
    }
  };

  return (
    <SupervisorLayout
      title="Tasks"
      subtitle="Assign work to your interns and follow it through to review."
      actions={
        <Button icon="plus" onClick={() => setForm("new")} disabled={interns.length === 0}>
          Assign a task
        </Button>
      }
    >
      <div className="space-y-5">
        {work.error && <ErrorNotice message={work.error} onRetry={() => void work.reload()} />}

        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <FilterChips
              label="Filter tasks"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All", count: counts.all },
                { value: "open", label: "With intern", count: counts.open },
                { value: "Submitted", label: "To review", count: counts.Submitted },
                { value: "Reviewed", label: "Reviewed", count: counts.Reviewed },
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
              icon="tasks"
              title={tasks.length === 0 ? "No tasks assigned yet" : "No tasks here"}
              description={
                tasks.length === 0
                  ? interns.length === 0
                    ? "You can assign tasks once interns are assigned to you."
                    : "Assign the first task to get your interns started."
                  : undefined
              }
              action={
                tasks.length === 0 && interns.length > 0 ? (
                  <Button icon="plus" onClick={() => setForm("new")}>
                    Assign a task
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <ul className="divide-y divide-slate-100">
                {pager.pageItems.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onReview={() => setReviewId(task.id)}
                    onEdit={() => setForm(task)}
                    onCancel={() => setCancelling(task)}
                  />
                ))}
              </ul>
              <Pagination state={pager} noun="task" />
            </>
          )}
        </Card>
      </div>

      {form && (
        <TaskDialog
          key={form === "new" ? "new" : form.id}
          editing={form === "new" ? null : form}
          interns={interns}
          defaultInternId={internId}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            notifyDataChanged();
            void work.reload();
          }}
        />
      )}

      <ConfirmDialog
        open={cancelling !== null}
        title="Cancel this task?"
        message={
          cancelling
            ? `"${cancelling.title}" will be removed, and ${cancelling.student_name} will be told they no longer need to submit it. This cannot be undone.`
            : undefined
        }
        confirmLabel="Cancel task"
        cancelLabel="Keep task"
        tone="danger"
        busy={cancelBusy}
        onConfirm={() => void cancelTask()}
        onCancel={() => setCancelling(null)}
      />

      <Modal
        open={Boolean(reviewing)}
        onClose={() => setReviewId(null)}
        title={reviewing ? reviewing.student_name : ""}
        size="lg"
      >
        {reviewing && (
          <ReviewDetail
            item={{
              kind: "task",
              key: `task-${reviewing.id}`,
              waitingSince: reviewing.submitted_at || reviewing.created_at,
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

function TaskRow({
  task,
  onReview,
  onEdit,
  onCancel,
}: {
  task: TaskEntry;
  onReview: () => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const open = isOpen(task);
  const days = daysUntil(task.due_date);
  const late = open && days !== null && days < 0;
  const label = late
    ? "Overdue"
    : task.status === "Pending"
      ? "Not started"
      : task.status === "In Progress"
        ? "Sent back"
        : task.status === "Submitted"
          ? "To review"
          : "Reviewed";

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <p className="text-sm font-semibold text-slate-900">{task.title}</p>
          <StatusBadge
            status={label}
            tone={
              late
                ? "bad"
                : task.status === "Submitted"
                  ? "waiting"
                  : task.status === "Reviewed"
                    ? "good"
                    : task.status === "In Progress"
                      ? "info"
                      : "neutral"
            }
          />
        </div>
        <p className="mt-0.5 text-sm text-slate-600">
          {task.student_name}
          <span className={late ? "font-semibold text-red-600" : "text-slate-500"}>
            {" "}
            · {open ? dueLabel(task.due_date) : `Due ${formatDate(task.due_date)}`}
          </span>
          {task.priority && <span className="text-slate-500"> · {task.priority} priority</span>}
        </p>
        {task.description && (
          <p className="mt-1 line-clamp-2 text-sm text-slate-500">{task.description}</p>
        )}
        {task.attachment_file && (
          <button
            type="button"
            onClick={() => void downloadAttachment(task)}
            className="mt-1.5 inline-flex max-w-full items-center gap-1.5 text-sm font-medium text-psu-700 hover:underline"
          >
            <Icon name="document" size={15} className="shrink-0" />
            <span className="truncate">{task.attachment_name || "Attached file"}</span>
          </button>
        )}
        {task.status !== "Submitted" && task.review_notes && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            {typeof task.review_rating === "number" && task.review_rating > 0 && (
              <Stars value={task.review_rating} />
            )}
            <span>
              <span className="font-medium text-slate-700">Your feedback:</span>{" "}
              {task.review_notes}
            </span>
          </p>
        )}
      </div>

      {task.status === "Submitted" && (
        <Button onClick={onReview} className="sm:self-center">
          Review
        </Button>
      )}

      {/* A task can be changed or cancelled only until the intern submits it. */}
      {open && (
        <div className="flex shrink-0 gap-1 sm:self-center">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-psu-700 hover:bg-slate-100"
          >
            <Icon name="edit" size={15} />
            Edit
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 items-center rounded-md px-2.5 text-sm font-medium text-red-600 hover:bg-slate-100"
          >
            Cancel task
          </button>
        </div>
      )}
    </li>
  );
}

/*
|--------------------------------------------------------------------------
| ASSIGN OR EDIT A TASK
|--------------------------------------------------------------------------
|
| Mounted only while open, so it always starts from the task being edited
| (or blank, for a new one).
|
*/

function TaskDialog({
  editing,
  interns,
  defaultInternId,
  onClose,
  onSaved,
}: {
  editing: TaskEntry | null;
  interns: Intern[];
  defaultInternId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [studentId, setStudentId] = useState(editing?.student_id ?? "");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [priority, setPriority] = useState<"High" | "Medium" | "Low">(
    editing?.priority ?? "Medium"
  );
  const [dueDate, setDueDate] = useState(editing ? localDateKey(editing.due_date) : "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // A newly chosen file, and whether the file already on the task is kept.
  const [file, setFile] = useState<File | null>(null);
  const [keepExisting, setKeepExisting] = useState(Boolean(editing?.attachment_file));
  const fileInput = useRef<HTMLInputElement | null>(null);

  const chooseFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (!chosen) return;
    const problem = uploadProblem(chosen, MAX_ATTACHMENT_MB);
    if (problem) return setError(problem);
    setError("");
    setFile(chosen);
  };

  // With one intern there is nothing to choose; otherwise start from the
  // intern the list is filtered to.
  const chosen = studentId || defaultInternId || (interns.length === 1 ? interns[0].student_id : "");
  const today = localDateKey(new Date());

  const close = () => {
    if (!saving) onClose();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!chosen) return setError("Choose which intern the task is for.");
    if (!title.trim()) return setError("Give the task a title.");
    if (!dueDate) return setError("Set a due date.");
    if (dueDate < today) return setError("The due date cannot be in the past.");

    const details = new FormData();
    details.append("student_id", chosen);
    details.append("title", title.trim());
    details.append("description", description.trim());
    details.append("priority", priority);
    details.append("due_date", dueDate);
    if (file) details.append("attachment", file);
    else if (editing?.attachment_file && !keepExisting) details.append("remove_attachment", "true");

    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        editing ? `${API_URL}/api/tasks/${editing.id}` : `${API_URL}/api/tasks`,
        withSupervisorAuth({ method: editing ? "PUT" : "POST", body: details })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "The task could not be saved.");
      const name = interns.find((intern) => intern.student_id === chosen)?.name || "the intern";
      toast.success(
        editing ? `Task updated. ${name} has been notified.` : `Task assigned to ${name}.`
      );
      onSaved();
    } catch (submitError) {
      setError(errorText(submitError, "The task could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={close}
      title={editing ? "Edit task" : "Assign a task"}
      description={
        editing
          ? "The intern is told that the task changed."
          : "The intern is notified as soon as you assign it."
      }
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="task-form" busy={saving} failed={Boolean(error)}>
            {saving ? "Saving" : editing ? "Save changes" : "Assign task"}
          </Button>
        </>
      }
    >
      <form id="task-form" onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="task-intern" className="mb-1.5 block text-sm font-medium text-slate-700">
            Intern
          </label>
          <select
            id="task-intern"
            value={chosen}
            disabled={Boolean(editing)}
            onChange={(event) => setStudentId(event.target.value)}
            className="field"
          >
            {interns.length !== 1 && <option value="">Choose an intern</option>}
            {interns.map((intern) => (
              <option key={intern.student_id} value={intern.student_id}>
                {intern.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="task-title" className="mb-1.5 block text-sm font-medium text-slate-700">
            Title
          </label>
          <input
            id="task-title"
            type="text"
            maxLength={150}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="For example, Prepare the weekly inventory report"
            className="field"
          />
        </div>

        <div>
          <label
            htmlFor="task-description"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Instructions <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            id="task-description"
            rows={4}
            maxLength={2000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What should be done, and what should be submitted?"
            className="field resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="task-due" className="mb-1.5 block text-sm font-medium text-slate-700">
              Due date
            </label>
            <input
              id="task-due"
              type="date"
              min={today}
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="field"
            />
          </div>
          <div>
            <label
              htmlFor="task-priority"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Priority
            </label>
            <select
              id="task-priority"
              value={priority}
              onChange={(event) => setPriority(event.target.value as typeof priority)}
              className="field"
            >
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </div>
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
            aria-label="Task attachment"
            tabIndex={-1}
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
                aria-label="Remove chosen file"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          ) : editing?.attachment_file && keepExisting ? (
            <div className="flex items-center gap-3 rounded-lg border border-slate-300 px-3 py-2.5">
              <Icon name="document" className="shrink-0 text-psu-600" />
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                {editing.attachment_name || "Attached file"}
              </p>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="rounded-md px-2 py-1 text-sm font-medium text-psu-700 hover:bg-slate-100"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={() => setKeepExisting(false)}
                className="rounded-md px-2 py-1 text-sm font-medium text-red-600 hover:bg-slate-100"
              >
                Remove
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
                <span className="font-semibold text-psu-700">Attach a file</span>
                <span className="block text-xs text-slate-500">
                  {UPLOAD_HINT}, up to {MAX_ATTACHMENT_MB} MB
                </span>
              </span>
            </button>
          )}
          <p className="mt-1.5 text-xs text-slate-500">
            A template, brief or sample the intern needs for the task.
          </p>
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
