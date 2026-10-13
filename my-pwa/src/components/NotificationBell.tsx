import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BrandLoader } from "../brand";
import AnnouncementList from "./AnnouncementList";
import Icon from "./Icon";
import Tooltip from "./Tooltip";
import { FilterChips } from "./ui";
import { useNotificationFeed, type NotificationFilter } from "../lib/useNotificationFeed";
import {
  formatNotificationTime,
  notificationPath,
  type NotificationItem,
  type NotificationRole,
} from "../lib/useNotifications";

type Props = {
  role: NotificationRole;
  /** Classes for the bell button, so it matches the header it sits in. */
  buttonClassName: string;
  /** When set, the panel shows a link to the full notification page. */
  viewAllPath?: string;
  /** When set, clicking a notification also opens the page it is about. */
  resolvePath?: (item: NotificationItem) => string;
  /** When set, the panel has a second tab with this person's announcements. */
  announcementsFor?: "student" | "supervisor";
};

type Tab = "notifications" | "announcements";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
] as const;

/**
 * Header bell with an unread count and a panel for reading notifications.
 * The panel shows the newest twenty and loads twenty more each time the
 * list is scrolled to its end.
 */
export default function NotificationBell({
  role,
  buttonClassName,
  viewAllPath,
  resolvePath,
  announcementsFor,
}: Props) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [tab, setTab] = useState<Tab>("notifications");
  const {
    items: notifications,
    unread: unreadCount,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    markRead,
    markAllRead,
  } = useNotificationFeed(role, filter);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // The marker after the last row: when it scrolls into the list's view,
  // the next twenty are asked for.
  const observer = useRef<IntersectionObserver | null>(null);
  const endMarker = useCallback(
    (node: HTMLDivElement | null) => {
      observer.current?.disconnect();
      observer.current = null;
      // The list it is the last child of. (Not listRef: a child is attached
      // before its parent, so that would still be empty here.)
      const list = node?.parentElement;
      if (!node || !list) return;
      observer.current = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) void loadMore();
        },
        { root: list, rootMargin: "80px" }
      );
      observer.current.observe(node);
    },
    [loadMore]
  );

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <Tooltip label="Notifications" side="left">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        // What the badge shows is part of the name, so what is seen and what is
        // announced agree: past 99 the badge reads "99+" and the name adds the count.
        aria-label={
          unreadCount > 99
            ? `Notifications, 99+ unread (${unreadCount})`
            : unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
        }
        aria-expanded={open}
        className={buttonClassName}
      >
        <Icon name="bell" />
        {unreadCount > 0 && (
          <span
            className="tabular absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold leading-none text-white ring-2 ring-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      </Tooltip>

      {open && (
        <div className="fixed inset-x-3 top-[calc(4rem+var(--inb-top-inset))] z-40 origin-top-right animate-pop-in rounded-xl border border-slate-200 bg-white text-left shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96">
          {announcementsFor ? (
            <div role="tablist" aria-label="What to show" className="flex border-b border-slate-100 px-2">
              {(["notifications", "announcements"] as const).map((name) => (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  id={`bell-tab-${name}`}
                  aria-selected={tab === name}
                  aria-controls="bell-panel"
                  onClick={() => setTab(name)}
                  className={`-mb-px flex h-11 items-center border-b-2 px-3 text-sm font-semibold ${
                    tab === name
                      ? "border-psu-600 text-psu-800"
                      : "border-transparent text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {name === "notifications" ? "Notifications" : "Announcements"}
                </button>
              ))}
            </div>
          ) : (
            <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
              Notifications
            </p>
          )}

          {tab === "notifications" && (
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2">
              <FilterChips options={FILTERS} value={filter} onChange={setFilter} label="Which notifications" />
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className="shrink-0 text-xs font-semibold text-psu-700 hover:underline"
                >
                  Mark all as read
                </button>
              )}
            </div>
          )}

          {tab === "announcements" && announcementsFor && (
            <div
              id="bell-panel"
              role="tabpanel"
              aria-labelledby="bell-tab-announcements"
              tabIndex={0}
              className="max-h-[min(24rem,60dvh)] overflow-y-auto"
            >
              <AnnouncementList role={announcementsFor} compact />
            </div>
          )}

          {tab === "notifications" && (
          <div
            id="bell-panel"
            role={announcementsFor ? "tabpanel" : "region"}
            aria-labelledby={announcementsFor ? "bell-tab-notifications" : undefined}
            aria-label={announcementsFor ? undefined : "Notifications"}
            tabIndex={0}
            className="max-h-[min(24rem,60dvh)] overflow-y-auto"
          >
            {loading && (
              <div className="px-4 py-4">
                <BrandLoader variant="inline" role={role} process="notifications" />
              </div>
            )}
            {!loading && error && (
              <p role="alert" className="px-4 py-6 text-center text-sm text-red-600">
                {error}
              </p>
            )}
            {!loading && !error && notifications.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                {filter === "unread" ? "Nothing unread. You are up to date." : "You have no notifications."}
              </p>
            )}
            {!loading &&
              notifications.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (!item.is_read) void markRead(item.id);
                    // The portal's own rule if it gave one; otherwise the page
                    // the server stored with the notification.
                    const path = resolvePath ? resolvePath(item) : notificationPath(item, "");
                    if (path) {
                      setOpen(false);
                      navigate(path);
                    }
                  }}
                  className={`flex w-full gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50 ${
                    item.is_read ? "" : "bg-psu-50/60"
                  }`}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      item.is_read ? "bg-transparent" : "bg-psu-600"
                    }`}
                  />
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
                    <span className="mt-1 block text-xs text-slate-600">
                      {formatNotificationTime(item.created_at)}
                    </span>
                  </span>
                </button>
              ))}
            {!loading && hasMore && (
              <div ref={endMarker} className="px-4 py-3 text-center text-xs text-slate-500">
                {loadingMore ? (
                  "Loading more…"
                ) : (
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    className="font-semibold text-psu-700 hover:underline"
                  >
                    Load more
                  </button>
                )}
              </div>
            )}
          </div>
          )}

          {viewAllPath && tab === "notifications" && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate(viewAllPath);
              }}
              className="block w-full rounded-b-xl border-t border-slate-100 px-4 py-3 text-center text-sm font-semibold text-psu-700 hover:bg-slate-50"
            >
              View all notifications
            </button>
          )}
        </div>
      )}
    </div>
  );
}
