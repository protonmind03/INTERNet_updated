import { useEffect, useState } from "react";
import { API_URL, withRoleAuth } from "./api";
import { localDateKey } from "./format";
import type { SessionRole } from "./session";

/*
|--------------------------------------------------------------------------
| NAVIGATION COUNTS
|--------------------------------------------------------------------------
|
| The small numbers beside navigation links: how many things are waiting
| behind each one. Keyed by the link's path. Counts are kept between page
| changes so the badges do not flicker, and refreshed when something
| changes or a live notification arrives.
|
*/

export type NavCounts = Record<string, number>;

const FRESH_FOR_MS = 20_000;
const CHANGED_EVENT = "internet-data-changed";

const cache: Partial<Record<SessionRole, { at: number; counts: NavCounts }>> = {};

/** Call after saving something that could change a count. */
export function notifyDataChanged(): void {
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

async function getJson(role: SessionRole, path: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_URL}${path}`, withRoleAuth(role));
  if (!response.ok) throw new Error(`Request failed (${response.status}).`);
  return (await response.json()) as Record<string, unknown>;
}

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);

async function loadCounts(role: SessionRole): Promise<NavCounts> {
  const id = encodeURIComponent(localStorage.getItem(`${role}_id`) || "");
  if (!id) return {};

  if (role === "student") {
    const [tasks, attendance] = await Promise.all([
      fetch(`${API_URL}/api/tasks/student/${id}`, withRoleAuth(role)).then((response) =>
        response.ok ? response.json() : []
      ),
      getJson(role, `/api/attendance/${id}`),
    ]);
    const today = localDateKey(new Date());
    return {
      "/task": rows(tasks).filter(
        (task) => task.status === "Pending" || task.status === "In Progress"
      ).length,
      // Logs the student has to act on: rejected, or left without a time-out.
      "/daily-log": rows(attendance.attendance).filter(
        (log) =>
          log.status === "Rejected" ||
          (!log.time_out && String(log.date).slice(0, 10) < today)
      ).length,
    };
  }

  if (role === "supervisor") {
    // One small count from the server, not the four lists it is counted from.
    const summary = await getJson(role, "/api/supervisor/review-count");
    return { "/supervisor/dashboard": Number(summary.waiting) || 0 };
  }

  const summary = await getJson(role, "/api/coordinator/dashboard");
  return {
    "/coordinator/complaints": Number(summary.pendingComplaints) || 0,
    "/coordinator/monitoring": Number(summary.flaggedAttendance) || 0,
  };
}

export function useNavCounts(role: SessionRole): NavCounts {
  const [counts, setCounts] = useState<NavCounts>(() => cache[role]?.counts ?? {});

  useEffect(() => {
    let active = true;
    const refresh = (force: boolean) => {
      const cached = cache[role];
      if (!force && cached && Date.now() - cached.at < FRESH_FOR_MS) return;
      loadCounts(role)
        .then((next) => {
          cache[role] = { at: Date.now(), counts: next };
          if (active) setCounts(next);
        })
        .catch(() => {
          // A badge is a convenience; a failed refresh keeps the last counts.
        });
    };
    const onChange = () => refresh(true);

    refresh(false);
    window.addEventListener("internet-notification", onChange);
    window.addEventListener(CHANGED_EVENT, onChange);
    return () => {
      active = false;
      window.removeEventListener("internet-notification", onChange);
      window.removeEventListener(CHANGED_EVENT, onChange);
    };
  }, [role]);

  return counts;
}
