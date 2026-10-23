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
 * for reading without a connection. Loading the list is what records that
 * this person has seen what is on it (the server does that), so it is the
 * same wherever the list is shown. `compact` draws it as plain rows, for
 * the panel under the bell.
 */
export default function AnnouncementList({
  role,
  compact = false,
}: {
  role: "student" | "supervisor";
  compact?: boolean;
}) {
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

  if (compact) {
    if (error) {
      return (
        <div className="px-4 py-4">
          <ErrorNotice message={error} onRetry={() => void load()} />
        </div>
      );
    }
    if (loading) {
      return (
        <div className="px-4 py-3">
          <SkeletonRows rows={3} />
        </div>
      );
    }
    if (items.length === 0) {
      return (
        <p className="px-4 py-8 text-center text-sm text-slate-500">
          No announcements yet. What your OJT coordinator announces will be listed here.
        </p>
      );
    }
    return (
      <ul>
        {items.map((item) => (
          <li key={item.id} className="border-b border-slate-100 px-4 py-3 last:border-b-0">
            <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{formatDateTime(item.created_at)}</p>
            <p className="mt-1.5 whitespace-pre-line break-words text-sm text-slate-700">
              {item.message}
            </p>
          </li>
        ))}
      </ul>
    );
  }

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
            <h2 className="text-[16px] font-bold text-slate-900">{item.title}</h2>
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
