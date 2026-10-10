import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BrandLoader } from "../brand";
import Icon from "./Icon";
import Tooltip from "./Tooltip";
import {
  formatNotificationTime,
  useNotifications,
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
};

/** Header bell with an unread count and a panel for reading notifications. */
export default function NotificationBell({
  role,
  buttonClassName,
  viewAllPath,
  resolvePath,
}: Props) {
  const navigate = useNavigate();
  const { notifications, unreadCount, loading, error, markRead, markAllRead } =
    useNotifications(role);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

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
      <Tooltip label="Notifications" side="bottom">
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
        <Icon name="bell" />
        {unreadCount > 0 && (
          <span className="tabular absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold leading-none text-white ring-2 ring-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      </Tooltip>

      {open && (
        <div className="fixed inset-x-3 top-[calc(4rem+var(--inb-top-inset))] z-40 origin-top-right animate-pop-in rounded-xl border border-slate-200 bg-white text-left shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-xs font-semibold text-psu-700 hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-[min(24rem,60dvh)] overflow-y-auto">
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
                You have no notifications.
              </p>
            )}
            {!loading &&
              notifications.slice(0, 20).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (!item.is_read) void markRead(item.id);
                    const path = resolvePath?.(item);
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
                    <span className="mt-1 block text-xs text-slate-400">
                      {formatNotificationTime(item.created_at)}
                    </span>
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
