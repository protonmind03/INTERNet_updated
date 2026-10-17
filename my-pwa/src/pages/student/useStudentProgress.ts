import { useEffect, useState } from "react";
import { API_URL, withStudentAuth } from "../../lib/api";
import { savedFetch } from "../../lib/offlineStore";

/*
| The verified hours toward the requirement, for the folder's label tab
| (layouts/StudentLayout.tsx). The same summary Today shows (GET
| /api/dashboard/:id), through the same saved copy, so it is there offline.
| Every page draws the layout, so the last answer is kept between pages and
| asked for again only when a notification says something changed.
*/

export type StudentProgress = { rendered: number; required: number };

let known: { id: string; progress: StudentProgress } | null = null;

export function useStudentProgress(studentId: string | undefined): StudentProgress | null {
  const [progress, setProgress] = useState<StudentProgress | null>(() =>
    known && studentId && known.id === studentId ? known.progress : null
  );

  useEffect(() => {
    if (!studentId) return;
    let active = true;
    const load = async () => {
      try {
        const response = await savedFetch("student", "dashboard", `${API_URL}/api/dashboard/${encodeURIComponent(studentId)}`, withStudentAuth());
        if (!response.ok) return;
        const data = await response.json();
        const next = { rendered: Number(data.hoursRendered) || 0, required: Number(data.requiredHours) || 0 };
        known = { id: studentId, progress: next };
        if (active) setProgress(next);
      } catch {
        // No connection and nothing saved: the label tab simply has no progress line.
      }
    };
    if (!known || known.id !== studentId) void load();
    const refresh = () => void load();
    window.addEventListener("internet-notification", refresh);
    return () => {
      active = false;
      window.removeEventListener("internet-notification", refresh);
    };
  }, [studentId]);

  return progress;
}
