import NotificationFeed from "../../components/NotificationFeed";
import { Button } from "../../components/ui";
import StudentLayout from "../../layouts/StudentLayout";
import { useNotifications } from "../../lib/useNotifications";

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
        role="student"
        emptyDescription="You will be told here when a log is verified, a task is assigned or reviewed, or a document is checked."
      />
    </StudentLayout>
  );
}
