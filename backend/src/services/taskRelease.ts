/*
|--------------------------------------------------------------------------
| TASKS RELEASED ON A LATER DAY
|--------------------------------------------------------------------------
|
| A supervisor may prepare a task ahead and choose the day it appears
| (tasks.available_from, migration 041). Until that day the intern is not
| shown it and is told nothing about it: it is left out of every list,
| count and checklist a student reads. The supervisor sees it, marked
| "Scheduled".
|
| On the day, the intern is told "New task assigned", once. The release
| loop claims a task before it sends (it sets released_notified_at in the
| same statement that picks the task), so two rounds, or a restart between
| them, cannot send the same notice twice.
|
| "The day" is the day in the Philippines. The database connection's time
| zone is Asia/Manila, so CURRENT_DATE is that day.
|
*/

import type { Pool } from "pg";

/**
 * The SQL that is true for a task an intern may see: no release day, or
 * one that has come. `alias` is the tasks table's alias with its dot
 * ("t."), or "" for a query on `tasks` with none.
 */
export const released = (alias = "") =>
  `(${alias}available_from IS NULL OR ${alias}available_from <= CURRENT_DATE)`;

/** The opposite, for the supervisor's "Scheduled" mark. */
export const scheduledLater = (alias = "") =>
  `(${alias}available_from IS NOT NULL AND ${alias}available_from > CURRENT_DATE)`;

type Notify = (notification: {
  studentId?: string;
  title: string;
  message: string;
  type: string;
  entity?: { type: string; id: string | number };
}) => Promise<void>;

/**
 * Tells each intern about the tasks whose day has come. Returns how many
 * were announced. Safe to call as often as wanted.
 */
export async function releaseDueTasks(pool: Pool, notify: Notify): Promise<number> {
  // Claimed first: a task leaves this list the moment it is picked.
  const due = await pool.query<{ id: number; student_id: string; title: string; due_date: string; status: string }>(
    `UPDATE tasks t
     SET released_notified_at = NOW()
     WHERE t.available_from IS NOT NULL
       AND t.available_from <= CURRENT_DATE
       AND t.released_notified_at IS NULL
     RETURNING t.id, t.student_id, t.title, t.due_date::text AS due_date, t.status`
  );
  let announced = 0;
  for (const task of due.rows) {
    // One already submitted or reviewed needs no announcement.
    if (task.status !== "Pending" && task.status !== "In Progress") continue;
    try {
      await notify({
        studentId: String(task.student_id),
        title: "New task assigned",
        message: `"${task.title}" was assigned to you, due ${task.due_date}.`,
        type: "info",
        entity: { type: "task", id: task.id },
      });
      announced += 1;
    } catch (error) {
      // The task is released all the same: the intern sees it in their list.
      console.error("TASK RELEASE NOTIFICATION ERROR:", error);
    }
  }
  return announced;
}

/** Reads an optional release day from a request, or says what is wrong with it. */
export function readReleaseDay(
  value: unknown,
  today: string,
  dueDate: string
): { day: string | null } | { problem: string } {
  if (value === undefined || value === null || value === "") return { day: null };
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    return { problem: "The release date must be a valid date (YYYY-MM-DD)." };
  }
  if (value < today) return { problem: "The release date cannot be in the past." };
  if (value > dueDate) return { problem: "The due date must be on or after the release date." };
  // Today is the same as no release day at all: the task is out now.
  return { day: value === today ? null : value };
}
