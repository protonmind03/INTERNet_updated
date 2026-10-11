/*
|--------------------------------------------------------------------------
| NOTIFICATION PREFERENCES
|--------------------------------------------------------------------------
|
| Every notification is kept in the app, always. A person can choose, per
| category, whether it is also pushed to their devices and whether emails
| of that category are sent to them. Nothing stored means both are on.
|
| The password-reset email is not a category: it is sent because the
| person asked for it.
|
*/

import type { Pool } from "pg";

export type PreferenceRole = "student" | "supervisor" | "coordinator";
export type Channel = "push" | "email";

type Category = {
  key: string;
  label: string;
  /** What arrives under it, in a few words. */
  about: string;
  /** Roles the category is offered to; everyone when left out. */
  roles?: PreferenceRole[];
  /** False when no email of this category exists, so no email switch is shown. */
  email?: boolean;
  /** False when nothing of this category is pushed. */
  push?: boolean;
};

export const NOTIFICATION_CATEGORIES: Category[] = [
  { key: "attendance", label: "Attendance", about: "Time logs, decisions on them, and absences.", email: false },
  { key: "task", label: "Tasks", about: "New tasks, submissions, reviews and deadlines.", email: true },
  { key: "document", label: "Documents", about: "Uploads and decisions on them.", email: false },
  { key: "evaluation", label: "Evaluations", about: "Ratings and the final evaluation.", email: false },
  { key: "announcement", label: "Announcements", about: "What the OJT coordinator announces.", email: false },
  { key: "other", label: "Everything else", about: "Journals, concerns, account changes.", email: false },
  {
    key: "digest",
    label: "Summary emails",
    about: "A regular email of what is waiting for you.",
    roles: ["supervisor", "coordinator"],
    push: false,
    email: true,
  },
];

const TYPE_CATEGORY: Record<string, string> = {
  attendance: "attendance",
  task: "task",
  comment: "task",
  document: "document",
  evaluation: "evaluation",
  announcement: "announcement",
};

/** The category a notification of this type belongs to. */
export function categoryOf(type: string | null | undefined): string {
  return TYPE_CATEGORY[(type || "").toLowerCase()] ?? "other";
}

/** The categories offered to a role, with which switches each has. */
export function categoriesFor(role: PreferenceRole) {
  return NOTIFICATION_CATEGORIES.filter((item) => !item.roles || item.roles.includes(role)).map(
    (item) => ({
      key: item.key,
      label: item.label,
      about: item.about,
      has_push: item.push !== false,
      has_email: item.email === true,
    })
  );
}

/**
 * Whether this person wants this channel for this category. On unless they
 * turned it off; a failure to look it up also means on, so a database
 * hiccup never silences anyone.
 */
export async function allowsChannel(
  pool: Pool,
  role: PreferenceRole,
  accountId: string,
  category: string,
  channel: Channel
): Promise<boolean> {
  try {
    const result = await pool.query<{ push: boolean; email: boolean }>(
      `SELECT push, email FROM notification_preferences
       WHERE role = $1 AND account_id = $2 AND category = $3`,
      [role, accountId, category]
    );
    const row = result.rows[0];
    return row ? row[channel] : true;
  } catch (error) {
    console.error("NOTIFICATION PREFERENCE LOOKUP ERROR:", error);
    return true;
  }
}
