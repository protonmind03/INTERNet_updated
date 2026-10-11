import NotificationFeed from "../../components/NotificationFeed";
import { Button } from "../../components/ui";
import CoordinatorLayout from "../../layouts/CoordinatorLayout";
import { useNotifications } from "../../lib/useNotifications";
import { coordinatorNotificationTarget } from "./notificationTargets";

export default function CoordinatorNotifications() {
  const { notifications, unreadCount, loading, error, markRead, markAllRead } =
    useNotifications("coordinator");

  return (
    <CoordinatorLayout
      title="Notifications"
      subtitle="Concerns, flagged attendance and company ratings that need your attention."
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
        resolve={coordinatorNotificationTarget}
        emptyDescription="You will be told here when a concern is reported, an attendance log is flagged or a student rates their company."
      />
    </CoordinatorLayout>
  );
}
