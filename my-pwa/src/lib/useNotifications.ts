import { useCallback, useEffect, useState } from "react";
import { API_URL, withRoleAuth } from "./api";

export type NotificationRole = "student" | "supervisor" | "coordinator";

const READ_STATE_CHANGED = "internet-notifications-read";

export type NotificationItem = {
  id: number;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
};

/**
 * Loads the signed-in account's notifications, keeps them current when a
 * live notification arrives, and exposes read actions.
 */
export function useNotifications(role: NotificationRole) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const accountId = localStorage.getItem(`${role}_id`);
    if (!accountId) return;
    try {
      const response = await fetch(
        `${API_URL}/api/notifications/${role}/${encodeURIComponent(accountId)}`,
        withRoleAuth(role)
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to load notifications.");
      }
      setNotifications(data.notifications || []);
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load notifications."
      );
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    const refresh = () => {
      void load();
    };
    refresh();
    window.addEventListener("internet-notification", refresh);
    // The header bell and the notifications page each use this hook; when
    // one marks something read, the other reloads.
    window.addEventListener(READ_STATE_CHANGED, refresh);
    return () => {
      window.removeEventListener("internet-notification", refresh);
      window.removeEventListener(READ_STATE_CHANGED, refresh);
    };
  }, [load]);

  const markRead = useCallback(
    async (id: number) => {
      setNotifications((current) =>
        current.map((item) =>
          item.id === id ? { ...item, is_read: true } : item
        )
      );
      try {
        const response = await fetch(
          `${API_URL}/api/notifications/${id}/read`,
          withRoleAuth(role, { method: "PUT" })
        );
        if (!response.ok) await load();
        else window.dispatchEvent(new Event(READ_STATE_CHANGED));
      } catch {
        await load();
      }
    },
    [role, load]
  );

  const markAllRead = useCallback(async () => {
    setNotifications((current) =>
      current.map((item) => ({ ...item, is_read: true }))
    );
    try {
      const response = await fetch(
        `${API_URL}/api/notifications/read-all`,
        withRoleAuth(role, { method: "PUT" })
      );
      if (!response.ok) await load();
      else window.dispatchEvent(new Event(READ_STATE_CHANGED));
    } catch {
      await load();
    }
  }, [role, load]);

  const unreadCount = notifications.filter((item) => !item.is_read).length;

  return { notifications, unreadCount, loading, error, markRead, markAllRead };
}

export function formatNotificationTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
