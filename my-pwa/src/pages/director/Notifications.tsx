import NotificationFeed from "../../components/NotificationFeed";
import { Button } from "../../components/ui";
import DirectorLayout from "../../layouts/DirectorLayout";
import { useNotifications } from "../../lib/useNotifications";

export default function DirectorNotifications() {
  const { notifications, unreadCount, loading, error, markRead, markAllRead } = useNotifications("director");

  return (
    <DirectorLayout
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
        role="director"
        emptyDescription="You will be told here when something needs the OJT office."
      />
    </DirectorLayout>
  );
}
