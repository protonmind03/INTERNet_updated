import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  API_URL,
  downloadProtectedUpload,
  withSupervisorAuth,
} from "../../lib/api";

type TaskStatus = "Pending" | "In Progress" | "Submitted" | "Reviewed";

type Task = {
  id: number;
  student_id: string;
  student_name: string;
  title: string;
  description: string | null;
  priority: "High" | "Medium" | "Low";
  status: TaskStatus;
  due_date: string;
  submission_notes: string | null;
  submission_file: string | null;
  submitted_at: string | null;
  review_notes: string | null;
};

type Supervisor = {
  supervisor_id: string;
  name: string;
  company: string;
};

const statusColor: Record<TaskStatus, string> = {
  Pending: "bg-slate-100 text-slate-500",
  "In Progress": "bg-blue-50 text-blue-600",
  Submitted: "bg-amber-50 text-amber-600",
  Reviewed: "bg-emerald-50 text-emerald-600",
};

export default function SupervisorTasks() {
  const navigate = useNavigate();

  const [supervisor, setSupervisor] = useState<Supervisor | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [attachmentError, setAttachmentError] = useState("");
  const [filter, setFilter] = useState<"All" | TaskStatus>("All");

  const [showAssign, setShowAssign] = useState(false);
  const [assignForm, setAssignForm] = useState({
    student_id: "",
    title: "",
    description: "",
    priority: "Medium" as "High" | "Medium" | "Low",
    due_date: "",
  });
  const [assignError, setAssignError] = useState("");
  const [assigning, setAssigning] = useState(false);

  const [reviewTask, setReviewTask] = useState<Task | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("supervisor");
    if (!saved) {
      navigate("/");
      return;
    }
    setSupervisor(JSON.parse(saved));
  }, [navigate]);

  const loadTasks = async () => {
    const supervisorId = localStorage.getItem("supervisor_id");
    if (!supervisorId) return;

    try {
      setLoading(true);
      const response = await fetch(
        `${API_URL}/api/tasks/supervisor/${supervisorId}`,
        withSupervisorAuth()
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to load tasks.");
      setTasks(data.tasks || []);
      setLoadError("");
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Failed to load tasks."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (supervisor) loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supervisor]);

  const handleAssign = async () => {
    setAssignError("");

    if (!assignForm.student_id || !assignForm.title || !assignForm.due_date) {
      setAssignError("Student ID, title, and due date are required.");
      return;
    }

    try {
      setAssigning(true);
      const response = await fetch(`${API_URL}/api/tasks`, withSupervisorAuth({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...assignForm,
          assigned_by: supervisor?.name,
          assigned_by_id: supervisor?.supervisor_id,
        }),
      }));

      const data = await response.json();

      if (!response.ok) {
        setAssignError(data.message || "Failed to assign task.");
        return;
      }

      setShowAssign(false);
      setAssignForm({
        student_id: "",
        title: "",
        description: "",
        priority: "Medium",
        due_date: "",
      });
      loadTasks();
    } catch {
      setAssignError("Unable to connect to the server.");
    } finally {
      setAssigning(false);
    }
  };

  const submitReview = async (status: "Reviewed" | "In Progress") => {
    if (!reviewTask) return;

    try {
      setReviewing(true);
      const response = await fetch(`${API_URL}/api/tasks/${reviewTask.id}/review`, withSupervisorAuth({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, review_notes: reviewNotes }),
      }));
      const data = await response.json();
      if (!response.ok) {
        setAssignError(data.message || "Failed to save task review.");
        return;
      }
      setReviewTask(null);
      setReviewNotes("");
      loadTasks();
    } finally {
      setReviewing(false);
    }
  };

  const downloadSubmission = async (filePath: string) => {
    setAttachmentError("");
    try {
      await downloadProtectedUpload(filePath, "supervisor");
    } catch (error) {
      setAttachmentError(
        error instanceof Error
          ? error.message
          : "Unable to download the attachment."
      );
    }
  };

  const filteredTasks =
    filter === "All" ? tasks : tasks.filter((t) => t.status === filter);

  const awaitingCount = tasks.filter((t) => t.status === "Submitted").length;

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      {/* HEADER */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-[#0c1322] px-4 py-3 text-white md:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 font-bold text-slate-900">
            IN
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">INTERNet</p>
            <p className="text-[11px] leading-tight text-slate-400">
              Supervisor Portal
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/supervisor/dashboard")}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10"
          >
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => navigate("/supervisor/attendance")}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10"
          >
            Attendance
          </button>
          <span className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white">
            Tasks
          </span>
        </div>
      </header>

      <main className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              Task Assignment & Review
            </h1>
            <p className="text-sm text-slate-400">
              Assign tasks to your interns and review what they submit
              {awaitingCount > 0 && (
                <span className="ml-1 font-medium text-amber-600">
                  · {awaitingCount} awaiting your review
                </span>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAssign(true)}
            className="rounded-lg bg-[#0c1322] px-4 py-2 text-sm font-semibold text-white hover:bg-[#16233f]"
          >
            + Assign Task
          </button>
        </div>

        {loadError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {loadError}
          </p>
        )}
        {attachmentError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {attachmentError}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {(
            ["All", "Pending", "In Progress", "Submitted", "Reviewed"] as const
          ).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={
                filter === f
                  ? "rounded-lg bg-[#0c1322] px-4 py-1.5 text-sm font-medium text-white"
                  : "rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-sm text-slate-500 hover:bg-slate-50"
              }
            >
              {f}
            </button>
          ))}
        </div>

        <div className="space-y-2.5">
          {loading && (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
              Loading tasks...
            </div>
          )}

          {!loading && filteredTasks.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
              No tasks found.
            </div>
          )}

          {!loading &&
            filteredTasks.map((task) => (
              <div
                key={task.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {task.title}
                    </p>
                    <p className="text-xs text-slate-400">
                      {task.student_name} · Due {task.due_date}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      statusColor[task.status]
                    }`}
                  >
                    {task.status}
                  </span>
                </div>

                {task.description && (
                  <p className="mt-2 text-sm text-slate-600">
                    {task.description}
                  </p>
                )}

                {task.status === "Submitted" && (
                  <div className="mt-3 rounded-lg bg-amber-50/60 p-3">
                    <p className="text-xs font-semibold text-amber-700">
                      Submitted for review
                    </p>
                    {task.submission_notes && (
                      <p className="mt-1 text-xs text-slate-600">
                        {task.submission_notes}
                      </p>
                    )}
                    {task.submission_file && (
                      <button
                        type="button"
                        onClick={() => void downloadSubmission(task.submission_file!)}
                        className="mt-1 inline-block text-xs font-medium text-blue-600 hover:underline"
                      >
                        Download attachment
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setReviewTask(task);
                        setReviewNotes("");
                      }}
                      className="mt-2 block rounded-lg bg-[#0c1322] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#16233f]"
                    >
                      Review submission
                    </button>
                  </div>
                )}

                {task.status === "Reviewed" && task.review_notes && (
                  <p className="mt-2 text-xs text-emerald-600">
                    Review note: {task.review_notes}
                  </p>
                )}
              </div>
            ))}
        </div>
      </main>

      {/* ASSIGN MODAL */}
      {showAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-900">
              Assign Task
            </h2>

            {assignError && (
              <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                {assignError}
              </div>
            )}

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Student ID
                </label>
                <input
                  type="text"
                  value={assignForm.student_id}
                  onChange={(e) =>
                    setAssignForm({ ...assignForm, student_id: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Task Title
                </label>
                <input
                  type="text"
                  value={assignForm.title}
                  onChange={(e) =>
                    setAssignForm({ ...assignForm, title: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Description
                </label>
                <textarea
                  value={assignForm.description}
                  onChange={(e) =>
                    setAssignForm({
                      ...assignForm,
                      description: e.target.value,
                    })
                  }
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Priority
                  </label>
                  <select
                    value={assignForm.priority}
                    onChange={(e) =>
                      setAssignForm({
                        ...assignForm,
                        priority: e.target.value as "High" | "Medium" | "Low",
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                  >
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Due Date
                  </label>
                  <input
                    type="date"
                    min={new Date().toLocaleDateString("en-CA")}
                    value={assignForm.due_date}
                    onChange={(e) =>
                      setAssignForm({
                        ...assignForm,
                        due_date: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-2.5">
              <button
                type="button"
                onClick={() => setShowAssign(false)}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAssign}
                disabled={assigning}
                className="flex-1 rounded-lg bg-[#0c1322] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#16233f] disabled:opacity-60"
              >
                {assigning ? "Assigning..." : "Assign Task"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REVIEW MODAL */}
      {reviewTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-900">
              Review "{reviewTask.title}"
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Submitted by {reviewTask.student_name}
            </p>

            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Feedback (optional)
              </label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
              />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={reviewing}
                onClick={() => submitReview("In Progress")}
                className="rounded-lg border border-amber-200 bg-white px-4 py-2.5 text-sm font-medium text-amber-600 hover:bg-amber-50 disabled:opacity-60"
              >
                Send Back
              </button>
              <button
                type="button"
                disabled={reviewing}
                onClick={() => submitReview("Reviewed")}
                className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
              >
                {reviewing ? "Saving..." : "Approve"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
