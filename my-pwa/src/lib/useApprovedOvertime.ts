import { useEffect, useState } from "react";
import { API_URL, withRoleAuth } from "./api";

/*
| Phase 1.4: a trainee's approved overtime, for the remarks of their Daily
| Time Record (CS Form 48). Read by the trainee, their supervisor or a
| coordinator; an older server, or no connection, leaves it empty.
*/

export type ApprovedOvertime = { work_date: string; planned_start: string; planned_end: string };

export function useApprovedOvertime(role: "student" | "supervisor" | "coordinator", studentId: string | null | undefined): ApprovedOvertime[] {
  const [rows, setRows] = useState<ApprovedOvertime[]>([]);
  useEffect(() => {
    if (!studentId) return;
    let live = true;
    fetch(`${API_URL}/api/overtime/student/${encodeURIComponent(studentId)}/approved`, withRoleAuth(role))
      .then((response) => (response.ok ? response.json() : { overtime: [] }))
      .then((data: { overtime?: ApprovedOvertime[] }) => {
        if (live) setRows(data.overtime ?? []);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [role, studentId]);
  return rows;
}
