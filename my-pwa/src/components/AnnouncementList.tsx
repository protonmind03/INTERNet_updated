import { useCallback, useEffect, useState } from "react";
import { Card, EmptyState, ErrorNotice, SkeletonRows } from "./ui";
import { API_URL, withRoleAuth } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { savedFetch } from "../lib/offlineStore";
import { errorText } from "../lib/toast";

type Announcement = { id: number; title: string; message: string; created_at: string };

/**
 * The announcements the coordinator has sent to this person, newest first.
 * Shared by the student and supervisor pages. The last list seen is kept
 * for reading without a connection.
 */
export default function AnnouncementList({ role }: { role: "student" | "supervisor" }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await savedFetch(
        role,
        "announcements",
        `${API_URL}/api/announcements`,
        withRoleAuth(role)
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not load announcements.");
      setItems(data.announcements || []);
      setError("");
    } catch (loadError) {
      setError(errorText(loadError, "Could not load announcements."));
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    const refresh = () => {
      void load();
    };
    refresh();
    // A new announcement arrives as a live notification.
    window.addEventListener("internet-notification", refresh);
    return () => window.removeEventListener("internet-notification", refresh);
  }, [load]);

  if (error) return <ErrorNotice message={error} onRetry={() => void load()} />;
  if (loading) {
    return (
      <Card>
        <SkeletonRows rows={3} />
      </Card>
    );
  }
  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="megaphone"
          title="No announcements"
          description="What your OJT coordinator announces will be listed here."
        />
      </Card>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id}>
          <Card className="p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-slate-900">{item.title}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{formatDateTime(item.created_at)}</p>
            <p className="mt-2 whitespace-pre-line break-words text-sm text-slate-700">
              {item.message}
            </p>
          </Card>
        </li>
      ))}
    </ul>
  );
}
