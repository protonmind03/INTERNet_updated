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
      subtitle="Complaints, flagged attendance and feedback that need your attention."
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
        emptyDescription="You will be told here when a complaint is filed, an attendance log is flagged or feedback comes in."
      />
    </CoordinatorLayout>
  );
}
