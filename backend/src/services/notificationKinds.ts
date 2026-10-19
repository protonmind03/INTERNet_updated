/*
|--------------------------------------------------------------------------
| WHETHER A NOTIFICATION ASKS FOR SOMETHING
|--------------------------------------------------------------------------
|
| Iteration 21 (migration 070). Every notification is an 'action' (it opens
| the page where the person does or reads something) or 'info' (it only
| tells them, and is read in a dialog beside the announcements). Some
| actions are required: the trainee is expected to do something, and the
| bell shows "Action needed" until the route that does it sets acted_at.
|
| Decided here, from who receives it, its type and its title, for every
| notification the server writes (createNotification in server.ts). A
| writer may also say so itself. No imports: the tests load this file.
|
*/

export type NotificationKind = "action" | "info";

export type KindRule = {
  kind: NotificationKind;
  actionRequired: boolean;
  /** What the trainee is expected to do, for the routing table and the tests. */
  act?: "retake" | "time-out" | "open-task" | "submit" | "upload" | "resubmit" | "read" | "reply";
};

/** Titles that only inform, whoever receives them (lowercase). */
const INFO = [
  /^welcome/,
  /^supervisor assigned/,
  /schedule updated/,
  /^attendance verified/,
  /certified/,
  /required (ojt )?hours/,
  /^account /,
  /^absence (excused|unexcused|withdrawn)/,
  /recorded by your supervisor/,
  /accepted after all/,
  /^task cancelled/,
  /^task reviewed/,
  /^weekly report reviewed/,
  /^privacy notice/,
  /^note from /,
  /test notification/,
];

/**
 * A trainee's notifications that expect an act (titles as the server writes
 * them, lowercase). "read" opens the decision and needs nothing more, so it
 * is not flagged "Action needed".
 */
export const STUDENT_ACTS: Array<[RegExp, NonNullable<KindRule["act"]>]> = [
  [/^time-in photo rejected|^retake your time-in photo/, "retake"],
  [/forget to time out/, "time-out"],
  [/^attendance log rejected|^attendance times corrected|^day marked absent|^appeal decided/, "read"],
  [/^task past its deadline|^revisions requested/, "submit"],
  [/^new task assigned|^task updated/, "open-task"],
  [/^requirement due|^new document required|^document (rejected|returned)/, "upload"],
  [/^weekly report returned/, "resubmit"],
  [/^new message|^reply on your concern/, "reply"],
];

/** The kind of a notification about to be written. */
export function notificationKind(
  role: "student" | "supervisor" | "coordinator",
  type: string | undefined,
  title: string,
  link: string | null | undefined
): KindRule {
  const words = title.toLowerCase();
  if ((type || "").toLowerCase() === "announcement") return { kind: "info", actionRequired: false };
  if (INFO.some((pattern) => pattern.test(words))) return { kind: "info", actionRequired: false };
  if (role === "student") {
    const match = STUDENT_ACTS.find(([pattern]) => pattern.test(words));
    if (match) return { kind: "action", actionRequired: match[1] !== "read", act: match[1] };
  }
  return { kind: link ? "action" : "info", actionRequired: false };
}

type Queryable = { query: (text: string, values?: unknown[]) => Promise<unknown> };

/**
 * Marks a trainee's notifications as acted on, from the route that did the
 * act: those about the record (`entity`), or with one of these titles. A
 * failure never fails the act itself.
 */
export async function markActed(
  db: Queryable,
  studentId: string,
  match: { entity?: { type: string; id: string | number }; titles?: string[] }
): Promise<void> {
  try {
    if (match.entity) {
      await db.query(
        `UPDATE notifications SET acted_at = NOW()
         WHERE student_id = $1 AND acted_at IS NULL AND action_required = TRUE
           AND entity_type = $2 AND entity_id = $3`,
        [studentId, match.entity.type, String(match.entity.id)]
      );
    }
    if (match.titles && match.titles.length > 0) {
      await db.query(
        `UPDATE notifications SET acted_at = NOW()
         WHERE student_id = $1 AND acted_at IS NULL AND action_required = TRUE AND title = ANY($2::text[])`,
        [studentId, match.titles]
      );
    }
  } catch (error) {
    console.error("NOTIFICATION ACTED ERROR:", error);
  }
}
