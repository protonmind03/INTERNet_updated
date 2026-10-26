import { SummaryTiles } from "../../components/display";
import { useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import { daysUntil, dueLabel, formatDate, phDateKey } from "../../lib/format";
import { notifyDataChanged } from "../../lib/navCounts";
import { useAccount } from "../../lib/session";
import { errorText, toast } from "../../lib/toast";
import { usePagination } from "../../lib/usePagination";
import ReviewDetail from "./ReviewDetail";
import InternGroupSelect from "./InternGroups";
import { internPath } from "./internPath";
import TaskBoard from "./TaskBoard";
import Teams from "./Teams";
import { useInternGroups } from "./useInternGroups";
import { useTeams, type Team } from "./useTeams";
import {
  useSupervisorWork,
  type Intern,
  type TaskEntry,
} from "./useSupervisorWork";
import { sameId } from "../../lib/ids";

type Filter = "all" | "open" | "Submitted" | "Reviewed";
type View = "tasks" | "teams";

/** A line of the list: one intern's task, or a team task with a row per member behind it. */
type Row = { kind: "one"; key: string; task: TaskEntry } | { kind: "team"; key: string; id: number; tasks: TaskEntry[] };

/** What the dialog is open for. */
type Form =
  | { mode: "new"; team?: Team }
  | { mode: "edit"; task: TaskEntry }
  | { mode: "team-edit"; id: number; tasks: TaskEntry[] };

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
  const work = useSupervisorWork(supervisor?.supervisor_id, ["interns", "tasks"]);
  const { tasks, interns, loading } = work;

  const teams = useTeams();
  // "?view=teams" opens the Teams tab; "?intern=" narrows the list to one intern.
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "teams" ? "teams" : "tasks";
  const setView = (next: View) => setParams(next === "teams" ? { view: "teams" } : {}, { replace: true });
  // "?layout=board": the tasks as columns by where they stand (TaskBoard.tsx).
  const board = params.get("layout") === "board";
  const setBoard = (on: boolean) => {
    const copy = new URLSearchParams(params);
    if (on) copy.set("layout", "board");
    else copy.delete("layout");
    setParams(copy, { replace: true });
  };
  const [filter, setFilter] = useState<Filter>("all");
  const [internId, setInternId] = useState(() => params.get("intern") || "");
  // Interns of more than one program or block can be narrowed to one.
  const grouping = useInternGroups();
  const inGroup = grouping.has;
  // "?new=1" (Give a task, on an intern's page) opens the form at once.
  const [form, setForm] = useState<Form | null>(() => (params.get("new") === "1" ? { mode: "new" } : null));
  const [reviewId, setReviewId] = useState<number | null>(null);
  // One intern's task, or a whole team task.
  const [cancelling, setCancelling] = useState<Row | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  const scoped = useMemo(
    () =>
      (internId ? tasks.filter((task) => sameId(task.student_id, internId)) : tasks).filter((task) =>
        inGroup(task.student_id)
      ),
    [tasks, internId, inGroup]
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
  // A team task is one line, where its first member's row would be.
  const rows = useMemo<Row[]>(() => {
    const list: Row[] = [];
    const teamAt = new Map<number, Extract<Row, { kind: "team" }>>();
    for (const task of visible) {
      if (!task.group_task_id) {
        list.push({ kind: "one", key: `task-${task.id}`, task });
        continue;
      }
      const known = teamAt.get(task.group_task_id);
      if (known) {
        known.tasks.push(task);
        continue;
      }
      const row = { kind: "team" as const, key: `team-${task.group_task_id}`, id: task.group_task_id, tasks: [task] };
      teamAt.set(task.group_task_id, row);
      list.push(row);
    }
    return list;
  }, [visible]);
  const pager = usePagination(rows, 15);

  const reviewing = tasks.find((task) => task.id === reviewId && task.status === "Submitted");

  const cancelTask = async () => {
    if (!cancelling) return;
    setCancelBusy(true);
    try {
      const response = await fetch(
        cancelling.kind === "team"
          ? `${API_URL}/api/tasks/team/${cancelling.id}`
          : `${API_URL}/api/tasks/${cancelling.task.id}`,
        withSupervisorAuth({ method: "DELETE" })
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "The task could not be cancelled.");
      toast.success(
        cancelling.kind === "team"
          ? // The server says how many it cancelled and how many had already submitted.
            String(data.message || "Task cancelled.")
          : cancelling.task.scheduled
            ? "Task cancelled. The intern had not been shown it."
            : `Task cancelled. ${cancelling.task.student_name} has been notified.`
      );
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
        <Button icon="plus" onClick={() => setForm({ mode: "new" })} disabled={interns.length === 0}>
          Assign a task
        </Button>
      }
    >
      <div className="space-y-5">
        {work.error && <ErrorNotice message={work.error} onRetry={() => void work.reload()} />}

        <FilterChips
          label="Tasks or teams"
          value={view}
          onChange={setView}
          options={[
            { value: "tasks", label: "Tasks" },
            { value: "teams", label: "Teams", count: teams.list.length },
          ]}
        />

        {view === "teams" && (
          <Teams
            teams={teams}
            interns={interns}
            onAssign={(team) => setForm({ mode: "new", team })}
          />
        )}

        {view === "tasks" && (
        <>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="w-full">
              <SummaryTiles
                label="Filter tasks"
                value={filter}
                onChange={setFilter}
                tiles={[
                  { value: "all", label: "All", count: counts.all, icon: "list", tone: "brand" },
                  { value: "open", label: "With intern", count: counts.open, icon: "hourglass", tone: "info" },
                  { value: "Submitted", label: "To review", count: counts.Submitted, icon: "inbox", tone: (counts.Submitted) > 0 ? "warning" : "neutral" },
                  { value: "Reviewed", label: "Reviewed", count: counts.Reviewed, icon: "check-circle", tone: "success" },
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
          <div role="group" aria-label="Layout" className="inline-flex rounded-xl bg-slate-100 p-1">
            {[false, true].map((on) => (
              <button
                key={String(on)}
                type="button"
                aria-pressed={board === on}
                onClick={() => setBoard(on)}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors ${
                  board === on ? "bg-white text-psu-800 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Icon name={on ? "grid" : "list"} size={15} />
                {on ? "Board" : "List"}
              </button>
            ))}
          </div>
        </div>

        {board ? (
          loading ? (
            <SkeletonRows rows={5} />
          ) : (
            <TaskBoard
              tasks={scoped}
              onReview={setReviewId}
              onShowReviewed={() => {
                setBoard(false);
                setFilter("Reviewed");
              }}
            />
          )
        ) : (
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
                  <Button icon="plus" onClick={() => setForm({ mode: "new" })}>
                    Assign a task
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <ul className="divide-y divide-slate-100">
                {pager.pageItems.map((row) =>
                  row.kind === "team" ? (
                    <TeamTaskRow
                      key={row.key}
                      tasks={row.tasks}
                      onReview={setReviewId}
                      onEdit={() => setForm({ mode: "team-edit", id: row.id, tasks: row.tasks })}
                      onCancel={() => setCancelling(row)}
                    />
                  ) : (
                    <TaskRow
                      key={row.key}
                      task={row.task}
                      onReview={() => setReviewId(row.task.id)}
                      onEdit={() => setForm({ mode: "edit", task: row.task })}
                      onCancel={() => setCancelling(row)}
                    />
                  )
                )}
              </ul>
              <Pagination state={pager} noun="task" />
            </>
          )}
        </Card>
        )}
        </>
        )}
      </div>

      {form && (
        <TaskDialog
          key={form.mode === "new" ? `new-${form.team?.id ?? ""}` : form.mode === "edit" ? form.task.id : `team-${form.id}`}
          form={form}
          interns={interns}
          teams={teams.list}
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
          !cancelling
            ? undefined
            : cancelling.kind === "team"
              ? teamCancelText(cancelling.tasks)
              : cancelling.task.scheduled
                ? `"${cancelling.task.title}" will be removed. ${cancelling.task.student_name} has not been shown it yet, so they will not be told. This cannot be undone.`
                : `"${cancelling.task.title}" will be removed, and ${cancelling.task.student_name} will be told they no longer need to submit it. This cannot be undone.`
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

/** What cancelling a team task will do, counted from the rows on the page. */
function teamCancelText(tasks: TaskEntry[]): string {
  const open = tasks.filter(isOpen).length;
  const kept = tasks.length - open;
  return (
    `"${tasks[0].title}" will be removed for the ${open} ${open === 1 ? "member who has" : "members who have"} not submitted it.` +
    (kept > 0 ? ` ${kept} ${kept === 1 ? "member has" : "members have"} already submitted, and theirs is kept.` : "") +
    " This cannot be undone."
  );
}

/** How a task stands, in the list's words. */
function stateOf(task: TaskEntry): { label: string; tone: "bad" | "waiting" | "good" | "info" | "neutral"; late: boolean } {
  const days = daysUntil(task.due_date);
  const late = isOpen(task) && !task.scheduled && days !== null && days < 0;
  if (task.scheduled) return { label: "Scheduled", tone: "neutral", late };
  if (late) return { label: "Overdue", tone: "bad", late };
  if (task.status === "Pending") return { label: "Not started", tone: "neutral", late };
  if (task.status === "In Progress") return { label: "Sent back", tone: "info", late };
  if (task.status === "Submitted") return { label: "To review", tone: "waiting", late };
  return { label: "Reviewed", tone: "good", late };
}

/** One team task: a line for the whole team, opening to each member's own. */
function TeamTaskRow({
  tasks,
  onReview,
  onEdit,
  onCancel,
}: {
  tasks: TaskEntry[];
  onReview: (id: number) => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const first = tasks[0];
  const handedIn = tasks.filter((task) => task.status === "Submitted" || task.status === "Reviewed").length;
  const anyOpen = tasks.some(isOpen);
  const scheduled = tasks.every((task) => task.scheduled);
  const waiting = tasks.filter((task) => task.status === "Submitted").length;
  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <p className="text-sm font-semibold text-slate-900">{first.title}</p>
            <StatusBadge status="Team task" tone="info" />
            {scheduled ? (
              <StatusBadge status="Scheduled" tone="neutral" />
            ) : (
              <StatusBadge
                status={`${handedIn} of ${tasks.length} submitted`}
                tone={waiting > 0 ? "waiting" : handedIn === tasks.length ? "good" : "neutral"}
              />
            )}
          </div>
          <p className="mt-0.5 text-sm text-slate-600">
            {first.team_name || "A team that has since been removed"}
            <span className="text-slate-600">
              {" "}
              ·{" "}
              {scheduled && first.release_day
                ? `They will see it on ${formatDate(first.release_day)} · due ${formatDate(first.due_date)}`
                : anyOpen
                  ? dueLabel(first.due_date)
                  : `Due ${formatDate(first.due_date)}`}
            </span>
            {first.priority && <span className="text-slate-600"> · {first.priority} priority</span>}
          </p>
          {first.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{first.description}</p>}
        </div>
        {anyOpen && (
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
              className="inline-flex h-9 items-center rounded-md px-2.5 text-sm font-medium text-red-700 hover:bg-slate-100"
            >
              Cancel task
            </button>
          </div>
        )}
      </div>

      <details className="mt-2" open={waiting > 0}>
        <summary className="cursor-pointer text-sm font-semibold text-psu-700">
          Each member ({tasks.length})
        </summary>
        <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {tasks.map((task) => {
            const state = stateOf(task);
            return (
              <li key={task.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <Link
                  to={internPath(task.student_id, "tasks")}
                  className="min-w-0 truncate text-sm font-medium text-psu-700 hover:underline"
                >
                  {task.student_name}
                </Link>
                <span className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={state.label} tone={state.tone} />
                  {task.status === "Submitted" && (
                    <Button variant="secondary" onClick={() => onReview(task.id)}>
                      Review
                    </Button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </details>
    </li>
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
  const { label, tone, late } = stateOf(task);

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <p className="text-sm font-semibold text-slate-900">{task.title}</p>
          <StatusBadge status={label} tone={tone} />
        </div>
        <p className="mt-0.5 text-sm text-slate-600">
          <Link to={internPath(task.student_id, "tasks")} className="font-medium text-psu-700 hover:underline">
            {task.student_name}
          </Link>
          <span className={late ? "font-semibold text-red-600" : "text-slate-500"}>
            {" "}
            ·{" "}
            {task.scheduled && task.release_day
              ? `They will see it on ${formatDate(task.release_day)} · due ${formatDate(task.due_date)}`
              : open
                ? dueLabel(task.due_date)
                : `Due ${formatDate(task.due_date)}`}
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
  form,
  interns,
  teams,
  defaultInternId,
  onClose,
  onSaved,
}: {
  form: Form;
  interns: Intern[];
  teams: Team[];
  defaultInternId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  // One intern's task being changed, or a team task (its first row stands for all).
  const teamEdit = form.mode === "team-edit" ? form : null;
  const editing = form.mode === "edit" ? form.task : teamEdit ? teamEdit.tasks[0] : null;
  // Who it is for: an intern's id, or "team:<id>".
  const [studentId, setStudentId] = useState(
    form.mode === "new" && form.team ? `team:${form.team.id}` : editing?.student_id ?? ""
  );
  // The day the intern first sees it. Only a task still waiting for its day can have it moved.
  const canSchedule = !editing || Boolean(editing.scheduled);
  const [releaseDay, setReleaseDay] = useState(editing?.scheduled ? editing.release_day || "" : "");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [priority, setPriority] = useState<"High" | "Medium" | "Low">(
    editing?.priority ?? "Medium"
  );
  const [dueDate, setDueDate] = useState(editing ? phDateKey(editing.due_date) : "");
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
  const chosen =
    studentId ||
    defaultInternId ||
    (interns.length === 1 && teams.length === 0 ? interns[0].student_id : "");
  const today = phDateKey(new Date());
  const team = chosen.startsWith("team:") ? teams.find((item) => `team:${item.id}` === chosen) : undefined;
  const forTeam = Boolean(team) || Boolean(teamEdit);

  const close = () => {
    if (!saving) onClose();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!chosen) return setError("Choose who the task is for.");
    if (!title.trim()) return setError("Give the task a title.");
    if (!dueDate) return setError("Set a due date.");
    if (dueDate < today) return setError("The due date cannot be in the past.");
    if (canSchedule && releaseDay) {
      if (releaseDay < today) return setError("The release date cannot be in the past.");
      if (dueDate < releaseDay) return setError("The due date must be on or after the release date.");
    }

    setSaving(true);
    setError("");
    try {
      let response: Response;
      if (forTeam) {
        // A team task: one request, and the server makes or changes a row per member.
        response = await fetch(
          teamEdit ? `${API_URL}/api/tasks/team/${teamEdit.id}` : `${API_URL}/api/tasks/team`,
          withSupervisorAuth({
            method: teamEdit ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              group_id: team?.id,
              title: title.trim(),
              description: description.trim(),
              priority,
              due_date: dueDate,
              ...(canSchedule ? { available_from: releaseDay } : {}),
            }),
          })
        );
      } else {
        const details = new FormData();
        details.append("student_id", chosen);
        details.append("title", title.trim());
        details.append("description", description.trim());
        details.append("priority", priority);
        details.append("due_date", dueDate);
        if (canSchedule) details.append("available_from", releaseDay);
        if (file) details.append("attachment", file);
        else if (editing?.attachment_file && !keepExisting) details.append("remove_attachment", "true");
        response = await fetch(
          editing ? `${API_URL}/api/tasks/${editing.id}` : `${API_URL}/api/tasks`,
          withSupervisorAuth({ method: editing ? "PUT" : "POST", body: details })
        );
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "The task could not be saved.");
      const name = interns.find((intern) => sameId(intern.student_id, chosen))?.name || "the intern";
      const later = canSchedule && releaseDay > today;
      toast.success(
        forTeam
          ? // The server says how many members, and how many it left alone.
            String(data.message || "Task saved.")
          : editing
            ? editing.scheduled
              ? later
                ? `Task updated. ${name} will see it on ${formatDate(releaseDay)}.`
                : `Task updated. ${name} will be told about it today.`
              : `Task updated. ${name} has been notified.`
            : later
              ? `Task scheduled. ${name} will see it on ${formatDate(releaseDay)}.`
              : `Task assigned to ${name}.`
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
      title={teamEdit ? "Edit team task" : editing ? "Edit task" : "Assign a task"}
      description={
        teamEdit
          ? "Changes apply to each member who has not submitted yet."
          : editing
            ? editing.scheduled
              ? "The intern has not been shown this task yet."
              : "The intern is told that the task changed."
            : "The intern is told when the task is released: now, or on the day you choose."
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
            Assign to
          </label>
          {teamEdit ? (
            <p id="task-intern" className="text-sm text-slate-800">
              {editing?.team_name || "A team"}: {teamEdit.tasks.filter(isOpen).length} of {teamEdit.tasks.length}{" "}
              {teamEdit.tasks.length === 1 ? "member has" : "members have"} not submitted yet.
            </p>
          ) : (
            <select
              id="task-intern"
              value={chosen}
              disabled={Boolean(editing)}
              onChange={(event) => setStudentId(event.target.value)}
              className="field"
            >
              {!(interns.length === 1 && teams.length === 0) && <option value="">Choose an intern or a team</option>}
              <optgroup label="Interns">
                {interns.map((intern) => (
                  <option key={intern.student_id} value={intern.student_id}>
                    {intern.name}
                  </option>
                ))}
              </optgroup>
              {!editing && teams.length > 0 && (
                <optgroup label="Teams">
                  {teams.map((item) => {
                    const members = item.members.filter((member) => member.is_active).length;
                    return (
                      <option key={item.id} value={`team:${item.id}`} disabled={members === 0}>
                        {item.name} ({members} {members === 1 ? "member" : "members"})
                      </option>
                    );
                  })}
                </optgroup>
              )}
            </select>
          )}
          {team && (
            <p className="mt-1.5 text-xs text-slate-600">
              Each member gets their own copy and submits their own work:{" "}
              {team.members.filter((member) => member.is_active).map((member) => member.name).join(", ")}.
            </p>
          )}
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
            Instructions <span className="font-normal text-slate-500">(optional)</span>
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
              min={canSchedule && releaseDay > today ? releaseDay : today}
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

        {canSchedule && (
          <div>
            <label htmlFor="task-release" className="mb-1.5 block text-sm font-medium text-slate-700">
              Release on <span className="font-normal text-slate-600">(optional)</span>
            </label>
            <input
              id="task-release"
              type="date"
              min={today}
              value={releaseDay}
              onChange={(event) => setReleaseDay(event.target.value)}
              aria-describedby="task-release-hint"
              className="field"
            />
            <p id="task-release-hint" className="mt-1.5 text-xs text-slate-600">
              {editing?.scheduled
                ? "The day the intern first sees the task. Clear it to release the task today."
                : "Leave empty to release it now. With a later day, the intern does not see the task, and is not told about it, until then."}
            </p>
          </div>
        )}

        {forTeam ? (
          <p className="text-xs text-slate-600">
            A team task carries no attachment. Put what the team needs in the instructions.
          </p>
        ) : (
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">
            Attachment <span className="font-normal text-slate-500">(optional)</span>
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
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-600"
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
                className="inline-flex items-center rounded-md px-2 min-h-11 text-sm font-medium text-psu-700 hover:bg-slate-100"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={() => setKeepExisting(false)}
                className="inline-flex items-center rounded-md px-2 min-h-11 text-sm font-medium text-red-600 hover:bg-slate-100"
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
        )}

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
