import NotificationFeed from "../../components/NotificationFeed";
import { Button } from "../../components/ui";
import AdminLayout from "../../layouts/AdminLayout";
import { useNotifications } from "../../lib/useNotifications";

export default function AdminNotifications() {
  const { notifications, unreadCount, loading, error, markRead, markAllRead } = useNotifications("admin");

  return (
    <AdminLayout
      title="Notifications"
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
        role="admin"
        emptyDescription="You will be told here when the system needs you."
      />
    </AdminLayout>
  );
}
