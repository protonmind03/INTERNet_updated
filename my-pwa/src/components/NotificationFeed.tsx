import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon, { type IconName } from "./Icon";
import { Card, EmptyState, ErrorNotice, FilterChips, SkeletonRows } from "./ui";
import { formatDateTime, formatLongDate, localDateKey } from "../lib/format";
import type { NotificationItem } from "../lib/useNotifications";

type Filter = "all" | "unread";

export type NotificationTarget = { icon: IconName; path: string };

/**
 * The full notification list for a portal: grouped by day, filterable to
 * unread, and each row opens the page it is about. The caller supplies the
 * data (from `useNotifications`) and says where each kind of notification
 * leads in its portal.
 */
export default function NotificationFeed({
  notifications,
  unreadCount,
  loading,
  error,
  onRead,
  resolve,
  emptyDescription,
}: {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  error: string;
  onRead: (id: number) => void;
  resolve: (item: NotificationItem) => NotificationTarget;
  emptyDescription: string;
}) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");

  const groups = useMemo(() => {
    const visible =
      filter === "unread" ? notifications.filter((item) => !item.is_read) : notifications;
    const today = localDateKey(new Date());
    const byDay = new Map<string, NotificationItem[]>();
    for (const item of visible) {
      const key = localDateKey(item.created_at);
      byDay.set(key, [...(byDay.get(key) || []), item]);
    }
    return [...byDay.entries()].map(([key, items]) => ({
      key,
      label: key === today ? "Today" : formatLongDate(key),
      items,
    }));
  }, [notifications, filter]);

  const open = (item: NotificationItem) => {
    if (!item.is_read) onRead(item.id);
    const { path } = resolve(item);
    if (path) navigate(path);
  };

  return (
    <div className="space-y-4">
      {error && <ErrorNotice message={error} />}

      <FilterChips
        label="Filter notifications"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All", count: notifications.length },
          { value: "unread", label: "Unread", count: unreadCount },
        ]}
      />

      {loading ? (
        <Card>
          <SkeletonRows rows={5} />
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState
            icon="bell"
            title={filter === "unread" ? "You're all caught up" : "No notifications yet"}
            description={filter === "unread" ? "There is nothing unread." : emptyDescription}
          />
        </Card>
      ) : (
        groups.map((group) => (
          <section key={group.key}>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {group.label}
            </h2>
            <Card>
              <ul className="divide-y divide-slate-100">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => open(item)}
                      className={`flex w-full items-start gap-3 px-4 py-3.5 text-left first:rounded-t-xl last:rounded-b-xl hover:bg-slate-50 sm:px-5 ${
                        item.is_read ? "" : "bg-psu-50/60"
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          item.is_read
                            ? "bg-slate-100 text-slate-500"
                            : "bg-psu-100 text-psu-700"
                        }`}
                      >
                        <Icon name={resolve(item).icon} size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-sm text-slate-900 ${
                            item.is_read ? "font-medium" : "font-semibold"
                          }`}
                        >
                          {item.title}
                        </span>
                        <span className="mt-0.5 block text-sm text-slate-600">
                          {item.message}
                        </span>
                        <span className="mt-1 block text-xs text-slate-400">
                          {formatDateTime(item.created_at)}
                        </span>
                      </span>
                      {!item.is_read && (
                        <span
                          className="mt-2 h-2 w-2 shrink-0 rounded-full bg-psu-600"
                          aria-label="Unread"
                        />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
