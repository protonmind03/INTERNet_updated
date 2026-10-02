import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  formatNotificationTime,
  useNotifications,
  type NotificationRole,
} from "../lib/useNotifications";

type Props = {
  role: NotificationRole;
  /** Classes for the bell button, so it matches the header it sits in. */
  buttonClassName: string;
  /** When set, the panel shows a link to the full notification page. */
  viewAllPath?: string;
};

/** Header bell with an unread count and a panel for reading notifications. */
export default function NotificationBell({
  role,
  buttonClassName,
  viewAllPath,
}: Props) {
  const navigate = useNavigate();
  const { notifications, unreadCount, loading, error, markRead, markAllRead } =
    useNotifications(role);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        aria-expanded={open}
        className={buttonClassName}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-slate-200 bg-white text-left shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">
              Notifications
            </p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-xs font-medium text-indigo-600 hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading && (
              <p className="px-4 py-6 text-center text-xs text-slate-400">
                Loading...
              </p>
            )}
            {!loading && error && (
              <p role="alert" className="px-4 py-6 text-center text-xs text-red-600">
                {error}
              </p>
            )}
            {!loading && !error && notifications.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-slate-400">
                No notifications yet.
              </p>
            )}
            {notifications.slice(0, 20).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (!item.is_read) void markRead(item.id);
                }}
                className={`block w-full border-b border-slate-50 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50 ${
                  item.is_read ? "" : "bg-indigo-50/60"
                }`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span
                    className={`text-xs text-slate-800 ${
                      item.is_read ? "font-medium" : "font-semibold"
                    }`}
                  >
                    {item.title}
                  </span>
                  {!item.is_read && (
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {item.message}
                </span>
                <span className="mt-1 block text-[10px] text-slate-400">
                  {formatNotificationTime(item.created_at)}
                </span>
              </button>
            ))}
          </div>

          {viewAllPath && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate(viewAllPath);
              }}
              className="block w-full border-t border-slate-100 px-4 py-2.5 text-center text-xs font-medium text-indigo-600 hover:bg-slate-50"
            >
              View all notifications
            </button>
          )}
        </div>
      )}
    </div>
  );
}
