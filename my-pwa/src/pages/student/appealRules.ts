import type { AttendanceLog } from "./useAttendance";

/*
| Which decisions on a log can still be appealed, and until when (the
| student's Appeals.tsx; the Today and Attendance pages read it too).
| Within seven days of a supervisor correcting a log's times, rejecting its
| time-in photo or rejecting the day (backend routes/appeals.ts).
*/

export const APPEAL_DAYS = 7;

export type AppealKind = "time_correction" | "time_in_rejection" | "attendance_rejection";

const within = (moment: string | null | undefined, now: number) =>
  Boolean(moment) && now - Date.parse(String(moment)) <= APPEAL_DAYS * 86_400_000;

/** What on this log can still be appealed, most serious first. */
export function appealableKinds(log: AttendanceLog, now = Date.now()): AppealKind[] {
  if (log.appeal?.status === "open") return [];
  const kinds: AppealKind[] = [];
  if (log.status === "Rejected" && within(log.verified_at, now)) kinds.push("attendance_rejection");
  if (within(log.photo_rejected_at, now)) kinds.push("time_in_rejection");
  if (within(log.time_corrected_at, now)) kinds.push("time_correction");
  return kinds;
}

/** The last moment an appeal on this log can be sent: seven days after the latest decision that can be appealed. */
export function appealUntil(log: AttendanceLog): Date | null {
  const moments = [log.status === "Rejected" ? log.verified_at : null, log.photo_rejected_at, log.time_corrected_at]
    .filter(Boolean)
    .map((moment) => Date.parse(String(moment)))
    .filter((time) => Number.isFinite(time));
  return moments.length ? new Date(Math.max(...moments) + APPEAL_DAYS * 86_400_000) : null;
}
