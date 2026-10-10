import type { NotificationTarget } from "../../components/NotificationFeed";
import type { NotificationItem } from "../../lib/useNotifications";

/**
 * The page a coordinator notification is about, inferred from what it says.
 * Used by the header bell and by the full notifications page, so both open
 * the same place. An empty path means the notification has no page of its
 * own and is only marked as read.
 */
export function coordinatorNotificationTarget(item: NotificationItem): NotificationTarget {
  if (item.type === "announcement") return { icon: "megaphone", path: "" };
  const title = item.title.toLowerCase();
  if (title.includes("complaint")) return { icon: "flag", path: "/coordinator/complaints" };
  if (title.includes("attendance")) return { icon: "activity", path: "/coordinator/monitoring" };
  if (title.includes("feedback") || title.includes("evaluation")) {
    return { icon: "star", path: "/coordinator/evaluations" };
  }
  if (item.type === "document" || title.includes("document")) {
    return { icon: "document", path: "/coordinator/documents" };
  }
  return { icon: "bell", path: "" };
}
