import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Button, Modal } from "./ui";
import { API_URL, withRoleAuth } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { savedFetch } from "../lib/offlineStore";
import { useNotificationFeed } from "../lib/useNotificationFeed";
import type { NotificationItem } from "../lib/useNotifications";

/*
|--------------------------------------------------------------------------
| THE TRAINEE'S ANNOUNCEMENTS TAB
|--------------------------------------------------------------------------
|
| Iteration 21. Under the bell: the coordinator's announcements and the
| notifications that only inform (kind 'info': welcome, a supervisor
| assigned, a schedule change), newest first. Each opens a dialog with the
| full text; opening an unread notification marks it read. "Supervisor
| assigned" also offers "View supervisor contact" (Profile › Placement).
|
*/

type Announcement = { id: number; title: string; message: string; created_at: string };

type Row =
  | { key: string; source: "announcement"; title: string; message: string; created_at: string; unread: false }
  | { key: string; source: "notification"; title: string; message: string; created_at: string; unread: boolean; item: NotificationItem };

export default function TraineeAnnouncements({ onNavigate }: { onNavigate: () => void }) {
  const navigate = useNavigate();
  const feed = useNotificationFeed("student", "all", "info");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Row | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await savedFetch("student", "announcements", `${API_URL}/api/announcements`, withRoleAuth("student"));
      const data = await response.json().catch(() => ({}));
      if (response.ok) setAnnouncements(data.announcements || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const rows = useMemo<Row[]>(
    () =>
      [
        ...announcements.map((item) => ({
          key: `a-${item.id}`,
          source: "announcement" as const,
          title: item.title,
          message: item.message,
          created_at: item.created_at,
          unread: false as const,
        })),
        ...feed.items.map((item) => ({
          key: `n-${item.id}`,
          source: "notification" as const,
          title: item.title,
          message: item.message,
          created_at: item.created_at,
          unread: !item.is_read,
          item,
        })),
      ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    [announcements, feed.items]
  );

  const show = (row: Row) => {
    setOpen(row);
    if (row.source === "notification" && row.unread) void feed.markRead(row.item.id);
  };

  if ((loading || feed.loading) && rows.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-slate-600">Loading…</p>;
  }
  if (rows.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-slate-600">No announcements yet. They appear here when the OJT office sends one.</p>;
  }

  const supervisorAssigned = open?.source === "notification" && /^supervisor assigned/i.test(open.title);

  return (
    <>
      <ul>
        {rows.map((row) => (
          <li key={row.key} className="border-b border-slate-100 last:border-b-0">
            <button type="button" onClick={() => show(row)} className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50 ${row.unread ? "bg-psu-50/60" : ""}`}>
              <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${row.unread ? "bg-psu-600" : "bg-transparent"}`} />
              <span className="min-w-0 flex-1">
                <span className={`block text-sm text-slate-900 ${row.unread ? "font-semibold" : "font-medium"}`}>{row.title}</span>
                <span className="mt-0.5 line-clamp-2 block text-sm text-slate-600">{row.message}</span>
                <span className="mt-1 block text-xs text-slate-600">
                  {row.source === "announcement" ? "Announcement · " : ""}
                  {formatDateTime(row.created_at)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {createPortal(
      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open?.title ?? ""}
        description={open ? `${open.source === "announcement" ? "Announcement" : "Notification"} · ${formatDateTime(open.created_at)}` : undefined}
        footer={
          <>
            {supervisorAssigned && (
              <Button
                variant="secondary"
                onClick={() => {
                  setOpen(null);
                  onNavigate();
                  navigate("/profile?group=placement");
                }}
              >
                View supervisor contact
              </Button>
            )}
            <Button onClick={() => setOpen(null)}>Close</Button>
          </>
        }
      >
        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{open?.message}</p>
      </Modal>,
      document.body
      )}
    </>
  );
}
