import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_URL, withSupervisorAuth } from "../../lib/api";
import { notifyDataChanged } from "../../lib/navCounts";
import { savedFetch } from "../../lib/offlineStore";
import { errorText, withWorkingToast } from "../../lib/toast";

/*
|--------------------------------------------------------------------------
| SUPERVISOR DATA
|--------------------------------------------------------------------------
|
| Everything a supervisor works with comes from five lists: their interns,
| and those interns' attendance logs, tasks, documents and absences. This
| hook loads them once and exposes the review actions, so the Review queue
| and the individual pages always show the same thing.
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
  /**
   * How the photo was taken: by the intern's camera check, or by the
   * supervisor in person. Empty for older logs and for a photo the intern
   * replaced afterwards, neither of which was camera-checked.
   */
  capture_method: "liveness" | "supervisor" | null;
  /** At least one step's time came from the intern's phone while it was offline. */
  recorded_offline?: boolean;
  liveness_checks: { flash?: string; attempts?: number | null } | null;
  /** Why the supervisor recorded the time-in instead of the camera check. */
  capture_reason: string | null;
};

/** The lists a supervisor page can ask for. */
export type WorkList = "interns" | "attendance" | "tasks" | "documents" | "absences";

const ALL_LISTS: readonly WorkList[] = ["interns", "attendance", "tasks", "documents", "absences"];

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

/** `saveAs` names the copy kept for offline reading; without it nothing is kept. */
async function getJson(path: string, saveAs?: string): Promise<Record<string, unknown>> {
  const response = saveAs
    ? await savedFetch("supervisor", saveAs, `${API_URL}${path}`, withSupervisorAuth())
    : await fetch(`${API_URL}${path}`, withSupervisorAuth());
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof data.message === "string" ? data.message : "Could not load data.");
  }
  return data;
}

async function sendJson(
  method: "PATCH" | "POST",
  path: string,
  body: unknown,
  fallback: string
): Promise<void> {
  const response = await fetch(
    `${API_URL}${path}`,
    withSupervisorAuth({
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    })
  );
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof data.message === "string" ? data.message : fallback);
  }
}

/**
 * `lists` names what the page actually shows. The Review queue needs all
 * five; a page such as Evaluations only needs the interns, and asking for
 * just that keeps it from downloading every log, task and document first.
 */
export function useSupervisorWork(
  supervisorId: string | undefined,
  lists: readonly WorkList[] = ALL_LISTS
) {
  // The same lists in a fixed order, so the page can pass a new array each render.
  const wanted = ALL_LISTS.filter((list) => lists.includes(list)).join(",");
  const [interns, setInterns] = useState<Intern[]>([]);
  const [attendance, setAttendance] = useState<AttendanceEntry[]>([]);
  const [tasks, setTasks] = useState<TaskEntry[]>([]);
  const [documents, setDocuments] = useState<DocumentEntry[]>([]);
  const [absences, setAbsences] = useState<AbsenceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // A burst of live notifications should not start a burst of reloads: while
  // one is running, later requests share it and at most one more follows.
  const inFlight = useRef<Promise<void> | null>(null);
  const queued = useRef(false);

  const fetchAll = useCallback(async () => {
    if (!supervisorId) return;
    const id = encodeURIComponent(supervisorId);
    const want = (list: WorkList) => wanted.split(",").includes(list);
    const get = (list: WorkList, path: string) =>
      want(list) ? getJson(path) : Promise.resolve(null);
    try {
      // The intern list is the one part kept for offline reading. It is
      // settled by itself, so with no connection the interns still show
      // from their saved copy while the other lists report the problem.
      const internRequest = want("interns")
        ? getJson(`/api/supervisor/${id}/interns`, "interns")
        : Promise.resolve(null);
      internRequest
        .then((data) => {
          if (data) setInterns((data.interns as Intern[]) || []);
        })
        .catch(() => {});
      const [internData, attendanceData, taskData, documentData, absenceData] =
        await Promise.all([
          internRequest,
          get("attendance", `/api/supervisor/attendance/${id}`),
          get("tasks", `/api/tasks/supervisor/${id}`),
          get("documents", `/api/documents/supervisor`),
          get("absences", `/api/absences/supervisor`),
        ]);
      if (internData) setInterns((internData.interns as Intern[]) || []);
      if (attendanceData) setAttendance((attendanceData.attendance as AttendanceEntry[]) || []);
      if (taskData) setTasks((taskData.tasks as TaskEntry[]) || []);
      if (documentData) setDocuments((documentData.documents as DocumentEntry[]) || []);
      if (absenceData) setAbsences((absenceData.absences as AbsenceEntry[]) || []);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load your interns' records."));
    } finally {
      setLoading(false);
    }
  }, [supervisorId, wanted]);

  const load = useCallback((): Promise<void> => {
    if (inFlight.current) {
      queued.current = true;
      return inFlight.current;
    }
    const run = (async () => {
      do {
        queued.current = false;
        await fetchAll();
      } while (queued.current);
    })().finally(() => {
      inFlight.current = null;
    });
    inFlight.current = run;
    return run;
  }, [fetchAll]);

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
        // A time-in the supervisor recorded in person is already approved by
        // them; it is verified by itself when the intern times out.
        .filter(
          (entry) =>
            entry.status === "Pending" &&
            !(entry.capture_method === "supervisor" && !entry.time_out)
        )
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

  /**
   * Runs one change, then reloads. The reload also happens when the change
   * is refused, because a refusal usually means the item was changed by
   * someone else and the screen is out of date.
   */
  const change = useCallback(
    async (work: () => Promise<void>) => {
      try {
        await work();
      } catch (changeError) {
        await load();
        throw changeError;
      }
      await load();
      notifyDataChanged();
    },
    [load]
  );

  const decideAttendance = useCallback(
    // "Pending" withdraws an earlier decision and returns the log to the queue.
    // `expected` is the status the supervisor was looking at; the decision is
    // refused if the coordinator changed the log in the meantime.
    (
      id: number,
      status: "Verified" | "Rejected" | "Pending",
      reason?: string,
      expected?: AttendanceEntry["status"]
    ) =>
      change(() =>
        sendJson(
          "PATCH",
          `/api/attendance/${id}/status`,
          { status, reason: reason?.trim() || undefined, expected_status: expected },
          "The attendance log could not be updated."
        )
      ),
    [change]
  );

  /**
   * Records an intern's time-in with a photo the supervisor took, for when
   * the camera check cannot run on the intern's device.
   */
  const recordTimeIn = useCallback(
    (studentId: string, photo: File, reason: string, note: string) =>
      change(async () => {
        const form = new FormData();
        form.append("student_id", studentId);
        form.append("reason", reason.trim());
        if (note.trim()) form.append("note", note.trim());
        // Already made smaller by the page that chose it (RecordTimeIn).
        form.append("image", photo);
        const response = await fetch(
          `${API_URL}/api/supervisor/attendance/record`,
          withSupervisorAuth({ method: "POST", body: form })
        );
        const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (!response.ok) {
          throw new Error(
            typeof data.message === "string" ? data.message : "The time-in could not be recorded."
          );
        }
      }),
    [change]
  );

  /** Verifies several complete logs, reloading once at the end. */
  const verifyMany = useCallback(
    async (ids: number[]): Promise<{ done: number; failure: string }> => {
      let done = 0;
      let failure = "";
      for (const id of ids) {
        try {
          await sendJson(
            "PATCH",
            `/api/attendance/${id}/status`,
            { status: "Verified", expected_status: "Pending" },
            "A log could not be saved."
          );
          done += 1;
        } catch (verifyError) {
          failure = errorText(verifyError, "A log could not be saved.");
          break;
        }
      }
      await load();
      notifyDataChanged();
      return { done, failure };
    },
    [load]
  );

  const decideTask = useCallback(
    (id: number, status: "Reviewed" | "In Progress", notes: string, rating: number | null) =>
      change(() =>
        sendJson(
          "PATCH",
          `/api/tasks/${id}/review`,
          { status, review_notes: notes.trim(), review_rating: rating || null },
          "The task review could not be saved."
        )
      ),
    [change]
  );

  const undoTask = useCallback(
    (id: number) =>
      change(() =>
        sendJson("POST", `/api/tasks/${id}/review/undo`, null, "The review could not be undone.")
      ),
    [change]
  );

  const decideDocument = useCallback(
    (id: number, status: "Approved" | "Rejected", notes: string) =>
      change(() =>
        sendJson(
          "PATCH",
          `/api/documents/${id}/review`,
          { status, review_notes: notes.trim() },
          "The document review could not be saved."
        )
      ),
    [change]
  );

  const undoDocument = useCallback(
    (id: number) =>
      change(() =>
        sendJson(
          "POST",
          `/api/documents/${id}/review/undo`,
          null,
          "The review could not be undone."
        )
      ),
    [change]
  );

  const decideAbsence = useCallback(
    // "Pending" withdraws the decision.
    (id: number, status: "Excused" | "Unexcused" | "Pending", notes: string) =>
      change(() =>
        sendJson(
          "PATCH",
          `/api/absences/${id}/review`,
          { status, notes: notes.trim() },
          "The absence could not be reviewed."
        )
      ),
    [change]
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
    recordTimeIn,
    verifyMany,
    decideTask,
    undoTask,
    decideDocument,
    undoDocument,
    decideAbsence,
  };
}

export type SupervisorWork = ReturnType<typeof useSupervisorWork>;

/** Downloads a submitted document through the supervisor's session. */
export async function downloadDocument(entry: DocumentEntry): Promise<void> {
  const response = await withWorkingToast("Preparing the file…", () =>
    fetch(`${API_URL}/api/documents/${entry.id}/file`, withSupervisorAuth())
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
