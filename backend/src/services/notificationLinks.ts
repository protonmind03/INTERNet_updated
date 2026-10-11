/*
|--------------------------------------------------------------------------
| WHERE A NOTIFICATION LEADS
|--------------------------------------------------------------------------
|
| Every notification is stored with the page it is about (`link`), so a tap
| on it, in the app or on a push notification, opens the right place. The
| caller may name the page or the record itself; when it does not, the page
| is worked out here from who receives it, its type and its title.
|
| This is the one place that rule lives. The portals keep a copy of the
| title rule only for notifications written before links were stored.
|
| What a student or supervisor reports is called a "concern" on screen.
| Notifications written before that say "complaint" and keep that title,
| so the title rule matches both words.
|
*/

export type NotificationRole = "student" | "supervisor" | "coordinator";

/** True for a title about a concern, in today's wording or the older one. */
const aboutConcern = (title: string) => title.includes("concern") || title.includes("complaint");

/** The record a notification is about. */
export type NotificationEntity = { type: string; id: string | number };

/** Each portal's full notification list: the fallback when nothing better is known. */
export const NOTIFICATION_PAGE: Record<NotificationRole, string> = {
  student: "/notifications",
  supervisor: "/supervisor/notifications",
  coordinator: "/coordinator/notifications",
};

function studentLink(type: string, title: string): string {
  if (title.includes("journal")) return "/journal";
  if (title.includes("absence")) return "/daily-log";
  if (type === "attendance") return "/daily-log";
  if (type === "task" || type === "comment") return "/task";
  if (type === "document") return "/documents";
  if (type === "evaluation") return "/student/feedback";
  if (type === "schedule") return "/schedule";
  if (aboutConcern(title)) return "/report";
  if (title.includes("supervisor assigned") || title.includes("schedule")) return "/schedule";
  if (title.includes("welcome") || title.includes("required hours") || title.includes("account")) {
    return "/student/dashboard";
  }
  if (title.includes("evaluation")) return "/student/feedback";
  if (title.includes("task") || title.includes("revision")) return "/task";
  if (title.includes("document")) return "/documents";
  if (title.includes("attendance") || title.includes("log") || title.includes("time-in")) {
    return "/daily-log";
  }
  return NOTIFICATION_PAGE.student;
}

function supervisorLink(type: string, title: string): string {
  // A journal waiting for a decision is in the queue; anything else about
  // journals is read on their own page.
  if (title.includes("journal") && !title.includes("submitted")) return "/supervisor/journals";
  if (title.includes("deadline")) return "/supervisor/tasks";
  if (title.includes("intern")) return "/supervisor/interns";
  // New work to decide on opens the review queue, which is the dashboard.
  if (
    title.includes("absence") ||
    title.includes("awaiting") ||
    title.includes("submitted") ||
    title.includes("ready to verify") ||
    title.includes("to review")
  ) {
    return "/supervisor/dashboard";
  }
  if (aboutConcern(title)) return "/supervisor/complaints";
  if (type === "task" || title.includes("task")) return "/supervisor/tasks";
  if (type === "document" || title.includes("document")) return "/supervisor/documents";
  if (type === "attendance" || title.includes("attendance")) return "/supervisor/attendance";
  return NOTIFICATION_PAGE.supervisor;
}

function coordinatorLink(type: string, title: string, entity?: NotificationEntity): string {
  if (aboutConcern(title)) return "/coordinator/complaints";
  if (title.includes("feedback") || title.includes("evaluation")) return "/coordinator/evaluations";
  // About one student: open that student's record.
  if (entity?.type === "student") {
    return `/coordinator/students/${encodeURIComponent(String(entity.id))}`;
  }
  if (type === "attendance" || title.includes("attendance")) return "/coordinator/monitoring";
  if (type === "document" || title.includes("document")) return "/coordinator/documents";
  return NOTIFICATION_PAGE.coordinator;
}

/** The page a notification opens when its writer did not name one. */
export function notificationLink(
  role: NotificationRole,
  type: string | undefined,
  title: string,
  entity?: NotificationEntity
): string {
  const kind = (type || "").toLowerCase();
  const words = title.toLowerCase();
  // An announcement opens the page that lists them. The coordinator, who
  // sends them, has that list on their own Announcements page.
  if (kind === "announcement") {
    if (role === "student") return "/announcements";
    if (role === "supervisor") return "/supervisor/announcements";
    return "/coordinator/announcements";
  }
  if (role === "student") return withRecord(role, studentLink(kind, words), entity);
  if (role === "supervisor") return withRecord(role, supervisorLink(kind, words), entity);
  return withRecord(role, coordinatorLink(kind, words, entity), entity);
}

/*
| The pages that can show one particular record, by who is looking and
| what kind of record it is. When a notification names a record of that
| kind and leads to that page, the link also says which record
| (`?focus=task-12`), and the page brings it into view or opens it.
*/
const RECORD_PAGES: Record<NotificationRole, Record<string, string>> = {
  student: { attendance: "/daily-log", task: "/task" },
  // The review queue holds every kind the supervisor decides.
  supervisor: {
    attendance: "/supervisor/dashboard",
    task: "/supervisor/dashboard",
    document: "/supervisor/dashboard",
    absence: "/supervisor/dashboard",
    journal: "/supervisor/dashboard",
  },
  coordinator: { complaint: "/coordinator/complaints" },
};

/** Adds the record to a link when the page it leads to can show that record. */
export function withRecord(
  role: NotificationRole,
  link: string,
  entity?: NotificationEntity
): string {
  if (!entity) return link;
  const type = String(entity.type).toLowerCase();
  const id = String(entity.id);
  if (RECORD_PAGES[role][type] !== link || !/^[\w-]{1,80}$/.test(id)) return link;
  return `${link}?focus=${type}-${id}`;
}

/**
 * A link given by a caller, if it is safe to store: a path inside the app,
 * never an address somewhere else.
 */
export function safeLink(link: unknown): string | null {
  if (typeof link !== "string") return null;
  const trimmed = link.trim();
  if (!/^\/(?!\/)[\w\-./~%?=&:@+]*$/.test(trimmed) || trimmed.length > 300) return null;
  return trimmed;
}
