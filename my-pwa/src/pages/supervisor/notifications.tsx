import NotificationFeed, { type NotificationTarget } from "../../components/NotificationFeed";
import { Button } from "../../components/ui";
import SupervisorLayout from "../../layouts/SupervisorLayout";
import { useNotifications, type NotificationItem } from "../../lib/useNotifications";

/** Where a notification leads in the supervisor portal, inferred from what it says. */
function resolve(item: NotificationItem): NotificationTarget {
  if (item.type === "announcement") return { icon: "megaphone", path: "" };
  const title = item.title.toLowerCase();
  if (title.includes("absence")) return { icon: "calendar", path: "/supervisor/dashboard" };
  if (title.includes("deadline")) return { icon: "tasks", path: "/supervisor/tasks" };
  if (title.includes("intern")) return { icon: "users", path: "/supervisor/interns" };
  // New work to decide on opens the Review queue.
  if (
    title.includes("awaiting") ||
    title.includes("submitted") ||
    title.includes("ready to verify") ||
    title.includes("to review")
  ) {
    const icon = title.includes("task")
      ? "tasks"
      : title.includes("document")
        ? "document"
        : "clock";
    return { icon, path: "/supervisor/dashboard" };
  }
  if (title.includes("complaint")) return { icon: "flag", path: "/supervisor/complaints" };
  if (title.includes("task") || title.includes("deadline")) {
    return { icon: "tasks", path: "/supervisor/tasks" };
  }
  if (item.type === "document" || title.includes("document")) {
    return { icon: "document", path: "/supervisor/documents" };
  }
  if (item.type === "attendance" || title.includes("attendance")) {
    return { icon: "clock", path: "/supervisor/attendance" };
  }
  return { icon: "bell", path: "" };
}

export default function SupervisorNotifications() {
  const { notifications, unreadCount, loading, error, markRead, markAllRead } =
    useNotifications("supervisor");

  return (
    <SupervisorLayout
      title="Notifications"
      subtitle="Activity from your interns and the OJT coordinator."
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
        emptyDescription="You will be told here when an intern times in, submits a task or uploads a document."
      />
    </SupervisorLayout>
  );
}
