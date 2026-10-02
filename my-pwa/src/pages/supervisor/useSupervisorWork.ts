import { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL, withSupervisorAuth } from "../../lib/api";
import { notifyDataChanged } from "../../lib/navCounts";
import { errorText } from "../../lib/toast";

/*
|--------------------------------------------------------------------------
| SUPERVISOR DATA
|--------------------------------------------------------------------------
|
| Everything a supervisor works with comes from four lists: their interns,
| and those interns' attendance logs, tasks and documents. This hook loads
| them once and exposes the three review actions, so the Review queue and
| the individual pages always show the same thing.
|
*/

export type Intern = {
  student_id: string;
  name: string;
  email: string;
  program: string | null;
  company: string | null;
  required_hours: number;
  hours_rendered: number;
  active_tasks: number;
  tasks_awaiting_review: number;
  completion: number;
};

export type AttendanceEntry = {
  id: number;
  student_id: string;
  student_name: string;
  program: string | null;
  date: string;
  time_in: string | null;
  break_time: string | null;
  break_end_time: string | null;
  time_out: string | null;
  hours: number | string | null;
  note: string | null;
  status: "Pending" | "Verified" | "Rejected" | "Flagged";
  image_url: string | null;
  review_notes: string | null;
  verified_at: string | null;
  /** What the intern wrote when correcting or resubmitting this log. */
  correction_note: string | null;
  corrected_at: string | null;
};

export type TaskStatus = "Pending" | "In Progress" | "Submitted" | "Reviewed";

export type TaskEntry = {
  id: number;
  student_id: string;
  student_name: string;
  title: string;
  description: string | null;
  priority: "High" | "Medium" | "Low" | null;
  status: TaskStatus;
  due_date: string | null;
  created_at: string;
  submission_notes: string | null;
  submission_file: string | null;
  submitted_at: string | null;
  review_notes: string | null;
  review_rating: number | null;
  reviewed_at: string | null;
  /** A file the supervisor attached when assigning the task. */
  attachment_file: string | null;
  attachment_name: string | null;
};

export type DocumentEntry = {
  id: number;
  student_id: string;
  student_name: string;
  doc_type: string;
  original_filename: string;
  mime_type: string | null;
  size_bytes: number | string;
  status: "Pending" | "Approved" | "Rejected";
  review_notes: string | null;
  uploaded_at: string;
  reviewed_at: string | null;
};

export type AbsenceEntry = {
  id: number;
  student_id: string;
  student_name: string;
  date: string;
  reason: string;
  status: "Pending" | "Excused" | "Unexcused";
  review_notes: string | null;
  created_at: string;
};

/** One thing waiting for the supervisor's decision. */
export type QueueItem =
  | { kind: "attendance"; key: string; waitingSince: string; entry: AttendanceEntry }
  | { kind: "task"; key: string; waitingSince: string; entry: TaskEntry }
  | { kind: "document"; key: string; waitingSince: string; entry: DocumentEntry }
  | { kind: "absence"; key: string; waitingSince: string; entry: AbsenceEntry };

async function getJson(path: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_URL}${path}`, withSupervisorAuth());
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof data.message === "string" ? data.message : "Could not load data.");
  }
  return data;
}

async function patchJson(path: string, body: unknown, fallback: string): Promise<void> {
  const response = await fetch(
    `${API_URL}${path}`,
    withSupervisorAuth({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof data.message === "string" ? data.message : fallback);
  }
}

export function useSupervisorWork(supervisorId: string | undefined) {
  const [interns, setInterns] = useState<Intern[]>([]);
  const [attendance, setAttendance] = useState<AttendanceEntry[]>([]);
  const [tasks, setTasks] = useState<TaskEntry[]>([]);
  const [documents, setDocuments] = useState<DocumentEntry[]>([]);
  const [absences, setAbsences] = useState<AbsenceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supervisorId) return;
    const id = encodeURIComponent(supervisorId);
    try {
      const [internData, attendanceData, taskData, documentData, absenceData] =
        await Promise.all([
          getJson(`/api/supervisor/${id}/interns`),
          getJson(`/api/supervisor/attendance/${id}`),
          getJson(`/api/tasks/supervisor/${id}`),
          getJson(`/api/documents/supervisor`),
          getJson(`/api/absences/supervisor`),
        ]);
      setInterns((internData.interns as Intern[]) || []);
      setAttendance((attendanceData.attendance as AttendanceEntry[]) || []);
      setTasks((taskData.tasks as TaskEntry[]) || []);
      setDocuments((documentData.documents as DocumentEntry[]) || []);
      setAbsences((absenceData.absences as AbsenceEntry[]) || []);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load your interns' records."));
    } finally {
      setLoading(false);
    }
  }, [supervisorId]);

  useEffect(() => {
    const refresh = () => {
      void load();
    };
    refresh();
    // An intern timing in or submitting work raises a live notification.
    window.addEventListener("internet-notification", refresh);
    // Coming back to the tab is the other moment new work may be waiting.
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("internet-notification", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const queue = useMemo<QueueItem[]>(() => {
    const items: QueueItem[] = [
      ...attendance
        .filter((entry) => entry.status === "Pending")
        .map((entry) => ({
          kind: "attendance" as const,
          key: `attendance-${entry.id}`,
          waitingSince: entry.time_out || entry.time_in || entry.date,
          entry,
        })),
      ...tasks
        .filter((entry) => entry.status === "Submitted")
        .map((entry) => ({
          kind: "task" as const,
          key: `task-${entry.id}`,
          waitingSince: entry.submitted_at || entry.created_at,
          entry,
        })),
      ...documents
        .filter((entry) => entry.status === "Pending")
        .map((entry) => ({
          kind: "document" as const,
          key: `document-${entry.id}`,
          waitingSince: entry.uploaded_at,
          entry,
        })),
      ...absences
        .filter((entry) => entry.status === "Pending")
        .map((entry) => ({
          kind: "absence" as const,
          key: `absence-${entry.id}`,
          waitingSince: entry.created_at,
          entry,
        })),
    ];
    // Longest wait first.
    return items.sort(
      (a, b) => new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime()
    );
  }, [attendance, tasks, documents, absences]);

  const decideAttendance = useCallback(
    // "Pending" withdraws an earlier decision and returns the log to the queue.
    async (id: number, status: "Verified" | "Rejected" | "Pending", reason?: string) => {
      await patchJson(
        `/api/attendance/${id}/status`,
        { status, reason: reason?.trim() || undefined },
        "The attendance log could not be updated."
      );
      await load();
      notifyDataChanged();
    },
    [load]
  );

  const decideTask = useCallback(
    async (
      id: number,
      status: "Reviewed" | "In Progress",
      notes: string,
      rating: number | null
    ) => {
      await patchJson(
        `/api/tasks/${id}/review`,
        { status, review_notes: notes.trim(), review_rating: rating || null },
        "The task review could not be saved."
      );
      await load();
      notifyDataChanged();
    },
    [load]
  );

  const decideDocument = useCallback(
    async (id: number, status: "Approved" | "Rejected", notes: string) => {
      await patchJson(
        `/api/documents/${id}/review`,
        { status, review_notes: notes.trim() },
        "The document review could not be saved."
      );
      await load();
      notifyDataChanged();
    },
    [load]
  );

  const decideAbsence = useCallback(
    async (id: number, status: "Excused" | "Unexcused", notes: string) => {
      await patchJson(
        `/api/absences/${id}/review`,
        { status, notes: notes.trim() },
        "The absence could not be reviewed."
      );
      await load();
      notifyDataChanged();
    },
    [load]
  );

  return {
    interns,
    attendance,
    tasks,
    documents,
    absences,
    queue,
    loading,
    error,
    reload: load,
    decideAttendance,
    decideTask,
    decideDocument,
    decideAbsence,
  };
}

export type SupervisorWork = ReturnType<typeof useSupervisorWork>;

/** Downloads a submitted document through the supervisor's session. */
export async function downloadDocument(entry: DocumentEntry): Promise<void> {
  const response = await fetch(
    `${API_URL}/api/documents/${entry.id}/file`,
    withSupervisorAuth()
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "The document could not be downloaded.");
  }
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = window.document.createElement("a");
  link.href = objectUrl;
  link.download = entry.original_filename;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
