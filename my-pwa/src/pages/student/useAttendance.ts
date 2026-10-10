import { useCallback, useEffect, useMemo, useState } from "react";
import type { LivenessReport } from "../../components/LivenessCamera";
import type { Prompt } from "../../lib/liveness/engine";
import { API_URL, withStudentAuth } from "../../lib/api";
import { localDateKey } from "../../lib/format";
import { compressPhoto } from "../../lib/image";
import { notifyDataChanged } from "../../lib/navCounts";
import {
  QUEUE_CHANGED,
  queueStep,
  sendWaitingSteps,
  waitingSteps,
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
  /** Steps taken offline on this phone that have not reached the server yet. */
  waiting?: StepPath[];
};

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
  return logs.map((log) => {
    const mine = steps.filter((step) => step.logId === log.id);
    if (mine.length === 0) return log;
    const next: AttendanceLog = { ...log, waiting: mine.map((step) => step.path) };
    for (const step of mine) {
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
export type LivenessChallenge = { ticket: string; prompts: Prompt[]; spare: Prompt };

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
  return log.time_in ? localDateKey(log.time_in) : String(log.date).split("T")[0];
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
    const today = localDateKey(new Date());
    return logs.find((log) => logDateKey(log) === today);
  }, [logs]);

  // An earlier day the student timed in on but never timed out of.
  const openPastLog = useMemo(() => {
    const today = localDateKey(new Date());
    return logs.find((log) => log.time_in && !log.time_out && logDateKey(log) < today);
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
    return data as unknown as LivenessChallenge;
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
   * Records a step on today's log. With a connection it goes straight to the
   * server ("sent"). With none it is kept on the phone with the time it was
   * pressed and sent later ("queued"); see lib/offlineQueue.ts.
   */
  const step = useCallback(
    async (path: StepPath, fallback: string): Promise<"sent" | "queued"> => {
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
                  body: "{}",
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
      const kept = await queueStep(todayLog.id, path);
      if (!kept) {
        throw new TypeError("No connection, and this browser cannot keep the step for later.");
      }
      setLogs((current) => withWaitingSteps(current, [kept]).map((log) =>
        log.id === kept.logId
          ? { ...log, waiting: [...(todayLog.waiting ?? []), kept.path] }
          : log
      ));
      if (mustQueue) void sendWaitingSteps();
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
    startBreak: () => step("break", "Could not record your break."),
    endBreak: () => step("break-end", "Could not record your return from break."),
    timeOut: () => step("time-out", "Could not record your time-out."),
  };
}

export type AttendanceController = ReturnType<typeof useAttendance>;
