import NotificationFeed, { type NotificationTarget } from "../../components/NotificationFeed";
import { Button } from "../../components/ui";
import StudentLayout from "../../layouts/StudentLayout";
import { useNotifications, type NotificationItem } from "../../lib/useNotifications";

/** Where a notification leads in the student portal, and how it is drawn. */
const KINDS: Record<string, NotificationTarget> = {
  attendance: { icon: "clock", path: "/daily-log" },
  task: { icon: "tasks", path: "/task" },
  document: { icon: "document", path: "/documents" },
  evaluation: { icon: "star", path: "/student/feedback" },
  comment: { icon: "note", path: "/task" },
};

function resolve(item: NotificationItem): NotificationTarget {
  if (item.type === "announcement") return { icon: "megaphone", path: "" };
  if (item.title.toLowerCase().includes("absence")) {
    return { icon: "calendar", path: "/daily-log" };
  }
  if (KINDS[item.type]) return KINDS[item.type];
  // Most notifications are stored with a generic type; infer from the title.
  const title = item.title.toLowerCase();
  if (title.includes("complaint")) return { icon: "flag", path: "/report" };
  if (title.includes("supervisor assigned") || title.includes("schedule")) {
    return { icon: "calendar", path: "/schedule" };
  }
  if (title.includes("welcome")) return { icon: "home", path: "/student/dashboard" };
  if (title.includes("evaluation")) return KINDS.evaluation;
  if (title.includes("task") || title.includes("revision")) return KINDS.task;
  if (title.includes("document")) return KINDS.document;
  if (title.includes("attendance") || title.includes("log")) return KINDS.attendance;
  return { icon: "bell", path: "" };
}

export default function Notifications() {
  const { notifications, unreadCount, loading, error, markRead, markAllRead } =
    useNotifications("student");

  return (
    <StudentLayout
      title="Notifications"
      subtitle="Updates from your supervisor and OJT coordinator."
      actions={
        unreadCount > 0 ? (
          <Button variant="secondary" icon="check" onClick={() => void markAllRead()}>
            Mark all as read
          </Button>
        ) : undefined
      }
    >
      <NotificationFeed
        notifications={notifications}
        unreadCount={unreadCount}
        loading={loading}
        error={error}
        onRead={(id) => void markRead(id)}
        resolve={resolve}
        emptyDescription="You will be told here when a log is verified, a task is assigned or reviewed, or a document is checked."
      />
    </StudentLayout>
  );
}
