import NotificationFeed from "../../components/NotificationFeed";
import { Button } from "../../components/ui";
import SupervisorLayout from "../../layouts/SupervisorLayout";
import { useNotifications } from "../../lib/useNotifications";

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
        role="supervisor"
        emptyDescription="You will be told here when an intern times in, submits a task or uploads a document."
      />
    </SupervisorLayout>
  );
}
