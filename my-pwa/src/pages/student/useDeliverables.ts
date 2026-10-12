import { useCallback, useEffect, useState } from "react";
import { API_URL, withStudentAuth } from "../../lib/api";
import { savedFetch } from "../../lib/offlineStore";
import type { CalendarTask } from "../../lib/studentCalendar";

/*
| What is due of the student, with dates: the one-off deliverables that
| have a day, and each week of the weekly ones. Kept for offline reading,
| so the Documents page and the calendar still show the dates with no
| connection. An older server has no such list; then there is simply
| nothing extra to show.
*/

export type DueStatus = "Not submitted" | "Submitted" | "Approved" | "Rejected";

export type OnceDeliverable = {
  requirement_id: number;
  name: string;
  due_date: string;
  status: DueStatus;
  reviewer_role: "supervisor" | "coordinator";
};

export type WeeklyItem = {
  item_id: number;
  requirement_id: number;
  name: string;
  description: string | null;
  reviewer_role: "supervisor" | "coordinator";
  /** The Monday the week starts on. */
  period_start: string;
  due_date: string;
  status: DueStatus;
  original_filename: string | null;
  review_notes: string | null;
};

export function useDeliverables(studentId: string | undefined) {
  const [deliverables, setDeliverables] = useState<OnceDeliverable[]>([]);
  const [weekly, setWeekly] = useState<WeeklyItem[]>([]);

  const reload = useCallback(async () => {
    if (!studentId) return;
    try {
      const response = await savedFetch(
        "student",
        "deliverables",
        `${API_URL}/api/students/${encodeURIComponent(studentId)}/deliverables`,
        withStudentAuth()
      );
      if (!response.ok) return;
      const data = await response.json();
      setDeliverables(Array.isArray(data.deliverables) ? data.deliverables : []);
      setWeekly(Array.isArray(data.weekly) ? data.weekly : []);
    } catch {
      // No connection and nothing saved: the pages stand without the dates.
    }
  }, [studentId]);

  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  return { deliverables, weekly, reload };
}

/**
 * The deliverables as marks for the calendar, which shows a dot on a day
 * something is due. They ride with the tasks; the ids are negative so one
 * can never be taken for a task's.
 */
export function deliverablesForCalendar(deliverables: OnceDeliverable[], weekly: WeeklyItem[]): CalendarTask[] {
  return [
    ...deliverables.map((item) => ({
      id: -item.requirement_id,
      title: `Deliverable: ${item.name}`,
      status: item.status,
      due_date: item.due_date,
    })),
    ...weekly.map((item) => ({
      id: -1_000_000 - item.item_id,
      title: `Deliverable: ${item.name}`,
      status: item.status,
      due_date: item.due_date,
    })),
  ];
}
