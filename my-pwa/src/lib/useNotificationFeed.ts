import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, withRoleAuth } from "./api";
import { savedFetch } from "./offlineStore";
import { toast } from "./toast";
import {
  READ_STATE_CHANGED,
  type NotificationItem,
  type NotificationRole,
} from "./useNotifications";

export type NotificationFilter = "all" | "unread";

/** How many the bell asks for at a time. */
export const FEED_PAGE = 20;
/** The most the server gives in one answer (services/listQuery.ts). */
const MOST_AT_ONCE = 200;

/**
 * The signed-in account's notifications a page at a time, for the bell.
 * The server pages them and counts them: `total` is how many there are
 * under the filter, `unread` how many are unread altogether, whether or
 * not they have been loaded. Kept current when a live notification
 * arrives or another part of the page marks something read.
 */
export function useNotificationFeed(role: NotificationRole, filter: NotificationFilter) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  // Answers that arrive after the filter changed are dropped.
  const request = useRef(0);
  const loaded = useRef(0);
  // Set while this hook's own change is announced, so it does not reload.
  const ownChange = useRef(false);

  const fetchPage = useCallback(
    async (offset: number, limit: number) => {
      const accountId = localStorage.getItem(`${role}_id`);
      if (!accountId) return null;
      const query = `limit=${limit}&offset=${offset}${filter === "unread" ? "&status=unread" : ""}`;
      const url = `${API_URL}/api/notifications/${role}/${encodeURIComponent(accountId)}?${query}`;
      // The newest page is kept for reading without a connection, except
      // the coordinator's: theirs name people across the whole programme.
      const response =
        role !== "coordinator" && offset === 0 && filter === "all"
          ? await savedFetch(role, "notifications-recent", url, withRoleAuth(role))
          : await fetch(url, withRoleAuth(role));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Failed to load notifications.");
      const rows: NotificationItem[] = data.notifications || [];
      return {
        rows,
        total: typeof data.total === "number" ? data.total : rows.length,
        unread:
          typeof data.unread === "number" ? data.unread : rows.filter((item) => !item.is_read).length,
      };
    },
    [role, filter]
  );

  /** Loads again from the top, as far down as was already on screen. */
  const reload = useCallback(async () => {
    const mine = ++request.current;
    try {
      const page = await fetchPage(0, Math.min(MOST_AT_ONCE, Math.max(FEED_PAGE, loaded.current)));
      if (mine !== request.current || !page) return;
      loaded.current = page.rows.length;
      setItems(page.rows);
      setTotal(page.total);
      setUnread(page.unread);
      setError("");
    } catch (loadError) {
      if (mine !== request.current) return;
      setError(loadError instanceof Error ? loadError.message : "Failed to load notifications.");
    } finally {
      if (mine === request.current) setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    loaded.current = 0;
    const refresh = () => {
      if (ownChange.current) return;
      void reload();
    };
    void Promise.resolve().then(() => {
      setLoading(true);
      setItems([]);
      refresh();
    });
    window.addEventListener("internet-notification", refresh);
    window.addEventListener(READ_STATE_CHANGED, refresh);
    return () => {
      window.removeEventListener("internet-notification", refresh);
      window.removeEventListener(READ_STATE_CHANGED, refresh);
    };
  }, [reload]);

  const hasMore = items.length < total;

  /** The next page, added below what is shown. */
  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore) return;
    const mine = request.current;
    setLoadingMore(true);
    try {
      const page = await fetchPage(loaded.current, FEED_PAGE);
      if (mine !== request.current || !page) return;
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        const next = [...current, ...page.rows.filter((item) => !seen.has(item.id))];
        loaded.current = next.length;
        return next;
      });
      // Nothing came back although more were counted: stop asking.
      setTotal(page.rows.length === 0 ? loaded.current : page.total);
      setUnread(page.unread);
    } catch {
      // Offline, most likely. What is loaded stays; scrolling asks again.
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, hasMore, loading, loadingMore]);

  const announce = () => {
    ownChange.current = true;
    window.dispatchEvent(new Event(READ_STATE_CHANGED));
    ownChange.current = false;
  };

  const markRead = useCallback(
    async (id: number) => {
      setItems((current) => current.map((item) => (item.id === id ? { ...item, is_read: true } : item)));
      setUnread((count) => Math.max(0, count - 1));
      try {
        const response = await fetch(
          `${API_URL}/api/notifications/${id}/read`,
          withRoleAuth(role, { method: "PUT" })
        );
        if (!response.ok) await reload();
        else announce();
      } catch {
        await reload();
      }
    },
    [role, reload]
  );

  const markAllRead = useCallback(async () => {
    setItems((current) => current.map((item) => ({ ...item, is_read: true })));
    setUnread(0);
    try {
      const response = await fetch(
        `${API_URL}/api/notifications/read-all`,
        withRoleAuth(role, { method: "PUT" })
      );
      if (!response.ok) throw new Error("not saved");
      announce();
      // Under "Unread" there is now nothing to list.
      if (filter === "unread") await reload();
    } catch {
      toast.error("Your notifications could not be marked as read. Please try again.");
      await reload();
    }
  }, [role, filter, reload]);

  return { items, total, unread, loading, loadingMore, hasMore, error, loadMore, markRead, markAllRead };
}
