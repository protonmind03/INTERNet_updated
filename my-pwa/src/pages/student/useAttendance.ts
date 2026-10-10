import { useCallback, useEffect, useMemo, useState } from "react";
import type { LivenessReport } from "../../components/LivenessCamera";
import type { Prompt } from "../../lib/liveness/engine";
import { API_URL, withStudentAuth } from "../../lib/api";
import { localDateKey } from "../../lib/format";
import { compressPhoto } from "../../lib/image";
import { notifyDataChanged } from "../../lib/navCounts";
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
};

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
      setLogs(Array.isArray(data.attendance) ? (data.attendance as AttendanceLog[]) : []);
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
    return () => window.removeEventListener("internet-notification", refresh);
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

  const step = useCallback(
    (path: "break" | "break-end" | "time-out", fallback: string) => {
      if (!todayLog) return Promise.reject(new Error("Time in first."));
      return run(
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
