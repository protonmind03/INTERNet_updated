import { phToday } from "../../lib/phTime";
import type { AttendanceEntry, SupervisorWork } from "./useSupervisorWork";

/** Today's log of each intern, if they have one. */
export function todaysLogs(work: SupervisorWork): Map<string, AttendanceEntry> {
  const today = phToday();
  const map = new Map<string, AttendanceEntry>();
  for (const entry of work.attendance) {
    if (String(entry.date).slice(0, 10) === today && entry.time_in) map.set(String(entry.student_id), entry);
  }
  return map;
}
