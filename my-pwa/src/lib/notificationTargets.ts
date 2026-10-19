import type { IconName } from "../components/Icon";

/*
|--------------------------------------------------------------------------
| WHERE A NOTIFICATION OPENS, IN EACH PORTAL
|--------------------------------------------------------------------------
|
| One rule for the bell, the notifications page and the live toast of every
| portal. In order:
|
|   1. the stored link, when it is a page of this portal (and not just the
|      notifications list);
|   2. the record it is about (entity_type and entity_id, stored since
|      migration 018), on this portal's page for that kind of record, with
|      ?focus= so the page brings it into view;
|   3. for older notifications with neither, a guess from the title;
|   4. nothing: the caller opens the notifications list and says so.
|
| The backend contract test loads this file (no import.meta here) and checks
| every entity_type the server emits against every portal.
|
*/

export type NotificationRole = "student" | "supervisor" | "coordinator";

export type ResolvableNotification = {
  title: string;
  type?: string | null;
  link?: string | null;
  entity_type?: string | null;
  entity_id?: string | number | null;
};

export type NotificationTarget = { icon: IconName; path: string };

export const NOTIFICATIONS_PAGE: Record<NotificationRole, string> = {
  student: "/notifications",
  supervisor: "/supervisor/notifications",
  coordinator: "/coordinator/notifications",
};

const HOME: Record<NotificationRole, string> = {
  student: "/student/dashboard",
  supervisor: "/supervisor/dashboard",
  coordinator: "/coordinator/dashboard",
};

/** The portal a path belongs to. */
export function portalOf(path: string): NotificationRole {
  if (path === "/supervisor" || path.startsWith("/supervisor/")) return "supervisor";
  if (path === "/coordinator" || path.startsWith("/coordinator/")) return "coordinator";
  return "student";
}

const focus = (path: string, kind: string, id: string) => `${path}?focus=${kind}-${encodeURIComponent(id)}`;

/** Each portal's page for each kind of record a notification can be about. */
export const ENTITY_ROUTES: Record<NotificationRole, Record<string, (id: string) => string>> = {
  student: {
    attendance: (id) => focus("/daily-log", "attendance", id),
    absence: () => "/daily-log",
    task: (id) => focus("/task", "task", id),
    document: () => "/documents",
    journal: () => "/journal",
    complaint: () => "/student/resolution?tab=concerns",
    student: () => HOME.student,
    message: (id) => `${HOME.student}?thread=${encodeURIComponent(id)}`,
  },
  supervisor: {
    // Every log, decided or not; the page opens the log's detail.
    attendance: (id) => focus("/supervisor/attendance", "attendance", id),
    // Waiting in the queue; once decided, the queue sends it on to Attendance.
    absence: (id) => focus("/supervisor/dashboard", "absence", id),
    task: (id) => focus("/supervisor/dashboard", "task", id),
    document: (id) => focus("/supervisor/documents", "document", id),
    journal: (id) => focus("/supervisor/journals", "journal", id),
    complaint: () => "/supervisor/complaints",
    student: (id) => `/supervisor/interns/${encodeURIComponent(id)}`,
    message: (id) => `${HOME.supervisor}?thread=${encodeURIComponent(id)}`,
  },
  coordinator: {
    attendance: () => "/coordinator/monitoring",
    absence: () => "/coordinator/monitoring",
    task: () => "/coordinator/monitoring",
    document: () => "/coordinator/documents",
    journal: () => "/coordinator/monitoring",
    complaint: (id) => `/coordinator/resolution?focus=complaint-${encodeURIComponent(id)}`,
    student: (id) => `/coordinator/students/${encodeURIComponent(id)}`,
    message: (id) => `${HOME.coordinator}?thread=${encodeURIComponent(id)}`,
  },
};

const ENTITY_ICON: Record<string, IconName> = {
  attendance: "clock",
  absence: "calendar",
  task: "tasks",
  document: "document",
  journal: "note",
  complaint: "flag",
  student: "user",
  message: "mail",
};

/** For notifications written before links and records were stored: what the title says. */
function fromWording(role: NotificationRole, item: ResolvableNotification): NotificationTarget | null {
  const kind = (item.type || "").toLowerCase();
  const title = item.title.toLowerCase();
  if (kind === "announcement") {
    return { icon: "megaphone", path: role === "student" ? "/announcements" : `/${role}/announcements` };
  }
  if (title === "new message") return null;
  const concern = title.includes("complaint") || title.includes("concern");
  const report = title.includes("weekly report") || title.includes("journal");

  if (role === "student") {
    if (title.includes("absence")) return { icon: "calendar", path: "/daily-log" };
    if (kind === "attendance") return { icon: "clock", path: "/daily-log" };
    if (kind === "task" || kind === "comment") return { icon: "tasks", path: "/task" };
    if (kind === "document") return { icon: "document", path: "/documents" };
    if (kind === "evaluation" || title.includes("evaluation")) return { icon: "star", path: "/student/resolution?tab=evaluations" };
    if (concern) return { icon: "flag", path: "/student/resolution?tab=concerns" };
    if (report) return { icon: "note", path: "/journal" };
    if (title.includes("supervisor assigned") || title.includes("schedule")) return { icon: "calendar", path: "/schedule" };
    if (title.includes("welcome")) return { icon: "home", path: HOME.student };
    if (title.includes("task") || title.includes("revision")) return { icon: "tasks", path: "/task" };
    if (title.includes("document")) return { icon: "document", path: "/documents" };
    if (title.includes("attendance") || title.includes("log") || title.includes("time-in")) return { icon: "clock", path: "/daily-log" };
    return null;
  }

  if (role === "supervisor") {
    if (report && !title.includes("submitted")) return { icon: "note", path: "/supervisor/journals" };
    if (title.includes("absence")) return { icon: "calendar", path: HOME.supervisor };
    if (title.includes("deadline")) return { icon: "tasks", path: "/supervisor/tasks" };
    if (title.includes("intern")) return { icon: "users", path: "/supervisor/interns" };
    if (["awaiting", "submitted", "ready to verify", "to review"].some((word) => title.includes(word))) {
      const icon: IconName = title.includes("task") ? "tasks" : title.includes("document") ? "document" : "clock";
      return { icon, path: HOME.supervisor };
    }
    if (concern) return { icon: "flag", path: "/supervisor/complaints" };
    if (kind === "task" || title.includes("task")) return { icon: "tasks", path: "/supervisor/tasks" };
    if (kind === "document" || title.includes("document")) return { icon: "document", path: "/supervisor/documents" };
    if (kind === "attendance" || title.includes("attendance")) return { icon: "clock", path: "/supervisor/attendance" };
    return null;
  }

  if (concern) return { icon: "flag", path: "/coordinator/resolution" };
  if (title.includes("appeal")) return { icon: "flag", path: "/coordinator/resolution?tab=appeals" };
  if (title.includes("feedback") || title.includes("evaluation")) return { icon: "star", path: "/coordinator/resolution?tab=evaluations" };
  if (kind === "attendance" || title.includes("attendance")) return { icon: "activity", path: "/coordinator/monitoring" };
  if (kind === "document" || title.includes("document")) return { icon: "document", path: "/coordinator/documents" };
  return null;
}

/*
| Iteration 21: where each of a trainee's notifications opens, and what on
| that page is spotlighted (the element marked data-focus="<key>"; see
| lib/spotlight.ts). The page is opened with ?spot=<key>. Checked before the
| stored link, so older notifications open the same way.
|
|   Photo rejected              Attendance        the Retake photo button
|   Log rejected / corrected    Schedule › day    the decision block
|   Forgot to time out          Attendance        the Time out tile
|   Task assigned / released    Tasks             the task's card
|   Task deadline               Tasks             its Submit button
|   Requirement due / returned  Documents         the requirement's row
|   Weekly report returned      Weekly report     the supervisor's note
|   Appeal decided              Attendance        the log, with its appeal
|   Concern reply / message     the thread        the newest reply
*/
type StudentRoute = { match: RegExp; path: (item: ResolvableNotification, id: string) => string | null; icon: IconName };

const spot = (path: string, key: string) => `${path}${path.includes("?") ? "&" : "?"}spot=${encodeURIComponent(key)}`;

export const STUDENT_ROUTES: StudentRoute[] = [
  { match: /^time-in photo rejected|^retake your time-in photo/, icon: "camera", path: () => spot("/daily-log", "retake-photo") },
  {
    match: /^attendance log rejected|^attendance times corrected|^day marked absent/,
    icon: "calendar",
    path: (_item, id) => (id ? spot(`/schedule?view=month&log=${encodeURIComponent(id)}`, "day-decision") : spot("/schedule?view=month", "day-decision")),
  },
  { match: /forget to time out/, icon: "clock", path: () => spot("/daily-log", "time-out") },
  { match: /^task past its deadline|^revisions requested/, icon: "tasks", path: (_item, id) => (id ? spot(`/task?focus=task-${encodeURIComponent(id)}`, `submit-${id}`) : "/task") },
  { match: /^new task assigned|^task updated/, icon: "tasks", path: (_item, id) => (id ? spot(`/task?focus=task-${encodeURIComponent(id)}`, `task-${id}`) : "/task") },
  { match: /^requirement due|^new document required|^document (rejected|returned)/, icon: "document", path: () => spot("/documents", "requirements") },
  { match: /^weekly report returned/, icon: "note", path: () => spot("/journal", "supervisor-note") },
  // A trainee's appeal lives on its log (pages/student/Appeals.tsx), so it opens there.
  { match: /^appeal decided/, icon: "flag", path: (_item, id) => (id ? `/daily-log?focus=attendance-${encodeURIComponent(id)}` : "/daily-log") },
];

/** The icon a notification is drawn with: what it is about, else what it says. */
function iconOf(role: NotificationRole, item: ResolvableNotification): IconName {
  const entity = (item.entity_type || "").toLowerCase();
  if (ENTITY_ICON[entity]) return ENTITY_ICON[entity];
  if (item.title.toLowerCase() === "new message") return "mail";
  return fromWording(role, item)?.icon ?? "bell";
}

/**
 * Where a notification opens in this portal. `path` is null when nothing
 * better than the notifications list is known; the caller opens the list
 * and says so.
 */
export function resolveNotificationTarget(
  role: NotificationRole,
  item: ResolvableNotification
): { icon: IconName; path: string | null } {
  const icon = iconOf(role, item);
  if (role === "student") {
    const route = STUDENT_ROUTES.find((each) => each.match.test(item.title.toLowerCase()));
    const id = item.entity_id === null || item.entity_id === undefined ? "" : String(item.entity_id);
    const path = route?.path(item, /^[\w-]{1,80}$/.test(id) ? id : "");
    if (route && path) return { icon: route.icon, path };
  }
  const link = typeof item.link === "string" ? item.link.trim() : "";
  if (link.startsWith("/") && !link.startsWith("//") && portalOf(link) === role && link !== NOTIFICATIONS_PAGE[role]) {
    return { icon, path: link };
  }
  const entity = (item.entity_type || "").toLowerCase();
  const id = item.entity_id === null || item.entity_id === undefined ? "" : String(item.entity_id);
  const route = ENTITY_ROUTES[role][entity];
  if (route && /^[\w-]{1,80}$/.test(id)) return { icon, path: route(id) };
  return { icon, path: fromWording(role, item)?.path ?? null };
}
