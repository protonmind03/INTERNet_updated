import { useEffect, useState } from "react";
import { API_URL, withSupervisorAuth } from "../../lib/api";
import { savedFetch } from "../../lib/offlineStore";
import type { CalendarShift } from "../../lib/studentCalendar";

type Row = CalendarShift & { student_id: string };

/**
 * Every one of the supervisor's interns' weekly schedules, from one
 * request (GET /api/supervisor/schedules), by student. `null` until the
 * answer is in, so a page never calls an intern "not scheduled" on a guess.
 * Kept for offline reading.
 */
export function useInternSchedules(): Map<string, CalendarShift[]> | null {
  const [schedules, setSchedules] = useState<Map<string, CalendarShift[]> | null>(null);

  useEffect(() => {
    let current = true;
    savedFetch("supervisor", "schedules", `${API_URL}/api/supervisor/schedules`, withSupervisorAuth())
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!current || !Array.isArray(data?.schedules)) return;
        const byStudent = new Map<string, CalendarShift[]>();
        for (const row of data.schedules as Row[]) {
          byStudent.set(row.student_id, [...(byStudent.get(row.student_id) ?? []), row]);
        }
        setSchedules(byStudent);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);

  return schedules;
}
