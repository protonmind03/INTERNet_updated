import { useCallback, useEffect, useMemo, useState } from "react";
import type { LivenessReport } from "../../components/LivenessCamera";
import type { Prompt } from "../../lib/liveness/engine";
import { API_URL, withStudentAuth } from "../../lib/api";
import { phDateKey } from "../../lib/format";
import { compressPhoto } from "../../lib/image";
import { notifyDataChanged } from "../../lib/navCounts";
import {
  LOCAL_LOG_ID,
  QUEUE_CHANGED,
  queueStep,
  queueTimeIn,
  sendWaitingSteps,
  waitingSteps,
  type QueuedPath,
  type QueuedStep,
  type StepPath,
} from "../../lib/offlineQueue";
import { savedFetch } from "../../lib/offlineStore";

export type AttendanceStatus = "Verified" | "Pending" | "Flagged" | "Rejected";

export type AttendanceLog = {
  id: number;
  student_id: string;
  date: string;
  time_in: string | null;
  break_time: string | null;
  break_end_time: string | null;
  time_out: string | null;
  hours: number | string | null;
  note: string | null;
  status: AttendanceStatus;
  image_url: string | null;
  review_notes?: string | null;
  verified_by?: string | null;
  verified_at?: string | null;
  /** What the student wrote when correcting or resubmitting this log. */
  correction_note?: string | null;
  corrected_at?: string | null;
  /** How the photo was taken: the camera check, or by the supervisor in person. */
  capture_method?: "liveness" | "supervisor" | null;
  /** At least one step's time came from the phone while it was offline. */
  recorded_offline?: boolean;
  /** The time-in itself was recorded with no connection: no photo, no camera check. */
  offline_time_in?: boolean;
  /** What the student wrote at time-out about the day's work. */
  accomplishments?: string | null;
  /** How many pictures are attached. Missing from an older server. */
  pictures?: number;
  /** The tasks the student said they worked on that day. Missing from an older server. */
  tasks?: { id: number; title: string }[];
  /** Set when the supervisor corrected the times on this log, with their reason. */
  time_corrected_at?: string | null;
  time_correction_reason?: string | null;
  /** Steps taken offline on this phone that have not reached the server yet. */
  waiting?: QueuedPath[];
};

/** True for a log that exists only on this phone so far: its time-in has not been sent. */
export const isLocalLog = (log: Pick<AttendanceLog, "id">): boolean => log.id === LOCAL_LOG_ID;

const STEP_FIELD: Record<StepPath, "break_time" | "break_end_time" | "time_out"> = {
  break: "break_time",
  "break-end": "break_end_time",
  "time-out": "time_out",
};

/**
 * Shows the steps still waiting on this phone as if they were recorded, so
 * the day reads correctly (and the same step cannot be pressed twice) until
 * the server has them.
 */
function withWaitingSteps(logs: AttendanceLog[], steps: QueuedStep[]): AttendanceLog[] {
  if (steps.length === 0) return logs;
  // A time-in still waiting has no log on the server. The day is shown from
  // what the phone holds, so the next step can be taken and the same
  // time-in cannot be recorded twice.
  const start = steps.find((step) => step.path === "time-in");
  const shown =
    start && !logs.some((log) => log.id === LOCAL_LOG_ID)
      ? [
          {
            id: LOCAL_LOG_ID,
            student_id: "",
            date: phDateKey(start.occurredAt),
            time_in: start.occurredAt,
            break_time: null,
            break_end_time: null,
            time_out: null,
            hours: null,
            note: typeof start.extra?.note === "string" ? start.extra.note : null,
            status: "Pending" as const,
            image_url: null,
            capture_method: null,
            recorded_offline: true,
            offline_time_in: true,
          },
          ...logs,
        ]
      : logs;
  return shown.map((log) => {
    const mine = steps.filter((step) => step.logId === log.id);
    if (mine.length === 0) return log;
    const next: AttendanceLog = { ...log, waiting: mine.map((step) => step.path) };
    for (const step of mine) {
      if (step.path === "time-in") continue;
      const field = STEP_FIELD[step.path];
      if (!next[field]) next[field] = step.occurredAt;
      // A break still open when the student timed out ends at the time-out.
      if (step.path === "time-out" && next.break_time && !next.break_end_time) {
        next.break_end_time = step.occurredAt;
      }
    }
    return next;
  });
}

/** The prompts the server picked for one time-in, and the ticket that proves it. */
export type LivenessChallenge = {
  ticket: string;
  /** "strict" adds the colour light test (services/liveness.ts on the server). */
  level: "standard" | "strict";
  prompts: Prompt[];
  spare: Prompt | null;
  /** When the ticket runs out, on this device's clock (ms). */
  expiresAt: number;
};

/** Where the student is in today's attendance. */
export type DayStage = "not-started" | "working" | "on-break" | "back" | "done";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("The server returned an unexpected response. Please try again.");
  }
}

function messageFrom(data: Record<string, unknown>, fallback: string): string {
  return typeof data.message === "string" && data.message ? data.message : fallback;
}

/** The calendar day a log belongs to, as "YYYY-MM-DD". */
export function logDateKey(log: AttendanceLog): string {
  return log.time_in ? phDateKey(log.time_in) : String(log.date).split("T")[0];
}

export function stageOf(log: AttendanceLog | undefined): DayStage {
  if (!log?.time_in) return "not-started";
  if (log.time_out) return "done";
  if (log.break_time && !log.break_end_time) return "on-break";
  if (log.break_end_time) return "back";
  return "working";
}

/** Minutes worked so far on a log, with the break taken out. */
export function workedMinutes(log: AttendanceLog, now: Date): number {
  if (!log.time_in) return 0;
  const start = new Date(log.time_in).getTime();
  const end = log.time_out ? new Date(log.time_out).getTime() : now.getTime();
  let breakMs = 0;
  if (log.break_time) {
    const breakStart = new Date(log.break_time).getTime();
    const breakEnd = log.break_end_time ? new Date(log.break_end_time).getTime() : end;
    breakMs = Math.max(0, breakEnd - breakStart);
  }
  return Math.max(0, (end - start - breakMs) / 60_000);
}

/**
 * Loads a student's attendance and exposes the four daily actions. Shared
 * by the Today page and the Attendance page so both always agree.
 */
export function useAttendance(studentId: string | undefined) {
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!studentId) return;
    try {
      const response = await savedFetch(
        "student",
        "attendance",
        `${API_URL}/api/attendance/${encodeURIComponent(studentId)}`,
        withStudentAuth()
      );
      const data = await readJson(response);
      if (!response.ok) {
        throw new Error(messageFrom(data, "Could not load your attendance."));
      }
      const loaded = Array.isArray(data.attendance) ? (data.attendance as AttendanceLog[]) : [];
      setLogs(withWaitingSteps(loaded, await waitingSteps()));
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof TypeError
          ? "Can't reach the server. Check your connection and try again."
          : loadError instanceof Error
            ? loadError.message
            : "Could not load your attendance."
      );
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    const refresh = () => {
      void load();
    };
    refresh();
    // A supervisor verifying a log raises a live notification; pick it up.
    window.addEventListener("internet-notification", refresh);
    // Steps recorded offline have just been sent (or refused).
    window.addEventListener(QUEUE_CHANGED, refresh);
    return () => {
      window.removeEventListener("internet-notification", refresh);
      window.removeEventListener(QUEUE_CHANGED, refresh);
    };
  }, [load]);

  const todayLog = useMemo(() => {
    const today = phDateKey(new Date());
    return logs.find((log) => logDateKey(log) === today);
  }, [logs]);

  // An earlier day the student timed in on but never timed out of.
  const openPastLog = useMemo(() => {
    const today = phDateKey(new Date());
    return logs.find(
      // One that exists only on this phone cannot be corrected on the server yet.
      (log) => log.time_in && !log.time_out && logDateKey(log) < today && !isLocalLog(log)
    );
  }, [logs]);

  const run = useCallback(
    async (request: () => Promise<Response>, fallback: string) => {
      setBusy(true);
      try {
        const response = await request();
        const data = await readJson(response);
        if (!response.ok) throw new Error(messageFrom(data, fallback));
        await load();
        notifyDataChanged();
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  /** Asks the server which prompts this time-in's camera check must show. */
  const livenessChallenge = useCallback(async (): Promise<LivenessChallenge> => {
    const response = await fetch(
      `${API_URL}/api/attendance/liveness-challenge`,
      withStudentAuth({ method: "POST" })
    );
    const data = await readJson(response);
    if (!response.ok || typeof data.ticket !== "string") {
      throw new Error(messageFrom(data, "Could not start the camera check."));
    }
    // The server says how long the ticket lasts; a few seconds are kept back
    // for the time the answer took to arrive.
    const lasts = (Number(data.expires_in) || 600) - 5;
    return {
      ticket: data.ticket,
      level: data.level === "strict" ? "strict" : "standard",
      prompts: (Array.isArray(data.prompts) ? data.prompts : []) as Prompt[],
      spare: (typeof data.spare === "string" ? data.spare : null) as Prompt | null,
      expiresAt: Date.now() + lasts * 1000,
    };
  }, []);

  const timeIn = useCallback(
    async (photo: File, note: string, check: { ticket: string; report: LivenessReport }) => {
      if (!studentId) throw new Error("Your session has ended. Please sign in again.");
      const image = await compressPhoto(photo);
      const form = new FormData();
      form.append("student_id", studentId);
      if (note.trim()) form.append("notes", note.trim());
      form.append("liveness_ticket", check.ticket);
      form.append("liveness_report", JSON.stringify(check.report));
      form.append("image", image);
      await run(
        () =>
          fetch(
            `${API_URL}/api/attendance`,
            withStudentAuth({ method: "POST", body: form })
          ),
        "Could not record your time-in."
      );
    },
    [studentId, run]
  );

  /**
   * Records the time-in on this phone, for when there is no connection. No
   * photo is taken or kept. False when this browser cannot keep it.
   */
  const timeInOffline = useCallback(async (note: string): Promise<boolean> => {
    const kept = await queueTimeIn(note);
    if (!kept) return false;
    setLogs((current) => withWaitingSteps(current, [kept]));
    // Start trying to send it: this keeps going until it gets through.
    void sendWaitingSteps();
    return true;
  }, []);

  /**
   * Records a step on today's log. With a connection it goes straight to the
   * server ("sent"). With none it is kept on the phone with the time it was
   * pressed and sent later ("queued"); see lib/offlineQueue.ts.
   */
  const step = useCallback(
    async (
      path: StepPath,
      fallback: string,
      extra?: Record<string, unknown>
    ): Promise<"sent" | "queued"> => {
      if (!todayLog) throw new Error("Time in first.");
      // Earlier steps are still waiting: this one has to wait behind them,
      // or the server would be asked for them out of order.
      const mustQueue = (todayLog.waiting?.length ?? 0) > 0;
      if (!mustQueue) {
        try {
          await run(
            () =>
              fetch(
                `${API_URL}/api/attendance/${todayLog.id}/${path}`,
                withStudentAuth({
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(extra ?? {}),
                })
              ),
            fallback
          );
          return "sent";
        } catch (error) {
          // fetch() rejects with a TypeError when the server cannot be reached.
          if (!(error instanceof TypeError)) throw error;
        }
      }
      const kept = await queueStep(todayLog.id, path, extra);
      if (!kept) {
        throw new TypeError("No connection, and this browser cannot keep the step for later.");
      }
      setLogs((current) => withWaitingSteps(current, [kept]).map((log) =>
        log.id === kept.logId
          ? { ...log, waiting: [...(todayLog.waiting ?? []), kept.path] }
          : log
      ));
      // Start trying to send it: this keeps going until it gets through.
      void sendWaitingSteps();
      return "queued";
    },
    [todayLog, run]
  );

  /** Enters the time-out for an earlier day that was left open. */
  const lateTimeOut = useCallback(
    (logId: number, timeOut: Date, reason: string) =>
      run(
        () =>
          fetch(
            `${API_URL}/api/attendance/${logId}/late-time-out`,
            withStudentAuth({
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ time_out: timeOut.toISOString(), reason }),
            })
          ),
        "Could not save the time-out."
      ),
    [run]
  );

  /** Sends a rejected log back to the supervisor, optionally with a new photo. */
  const resubmit = useCallback(
    async (logId: number, explanation: string, photo: File | null) => {
      const form = new FormData();
      form.append("explanation", explanation.trim());
      // Already made smaller by the page that chose it (AttendanceCorrections).
      if (photo) form.append("image", photo);
      await run(
        () =>
          fetch(
            `${API_URL}/api/attendance/${logId}/resubmit`,
            withStudentAuth({ method: "POST", body: form })
          ),
        "Could not send the log for another review."
      );
    },
    [run]
  );

  return {
    logs,
    loading,
    error,
    busy,
    reload: load,
    todayLog,
    openPastLog,
    lateTimeOut,
    resubmit,
    stage: stageOf(todayLog),
    livenessChallenge,
    timeIn,
    timeInOffline,
    startBreak: () => step("break", "Could not record that you went out for lunch."),
    endBreak: () => step("break-end", "Could not record that you are back from lunch."),
    /** Times out, with the student's note of what they did today. */
    /** `taskIds`: the tasks worked on today, if the student chose any. */
    timeOut: (accomplishments: string, taskIds: number[] = []) =>
      step("time-out", "Could not record your time-out.", {
        accomplishments: accomplishments.trim(),
        // Left out when none is chosen, so the request is what it always was.
        ...(taskIds.length > 0 ? { task_ids: taskIds } : {}),
      }),
  };
}

export type AttendanceController = ReturnType<typeof useAttendance>;
