import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  formatNotificationTime,
  useNotifications,
} from "../../lib/useNotifications";

type Filter = "all" | "unread";

export default function SupervisorNotifications() {
  const navigate = useNavigate();
  const { notifications, unreadCount, loading, error, markRead, markAllRead } =
    useNotifications("supervisor");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (
      !localStorage.getItem("supervisor") ||
      !localStorage.getItem("supervisor_token")
    ) {
      navigate("/");
    }
  }, [navigate]);

  const visible =
    filter === "unread"
      ? notifications.filter((item) => !item.is_read)
      : notifications;

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={() => navigate("/supervisor/dashboard")}
          className="mb-5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          ← Back to dashboard
        </button>
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
              Supervisor Portal
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">
              Notifications
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {unreadCount > 0
                ? `${unreadCount} unread`
                : "You're all caught up."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void markAllRead()}
            disabled={unreadCount === 0}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Mark all as read
          </button>
        </header>

        <div className="mb-4 inline-flex rounded-lg bg-slate-100 p-1">
          {(["all", "unread"] as Filter[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                filter === option
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {option === "all" ? "All" : `Unread (${unreadCount})`}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {loading && (
            <p className="p-8 text-center text-sm text-slate-400">Loading...</p>
          )}
          {!loading && visible.length === 0 && (
            <p className="p-8 text-center text-sm text-slate-400">
              {filter === "unread"
                ? "No unread notifications."
                : "No notifications yet."}
            </p>
          )}
          {visible.map((item) => (
            <article
              key={item.id}
              className={`flex items-start justify-between gap-4 border-b border-slate-100 p-4 last:border-b-0 ${
                item.is_read ? "" : "bg-amber-50/50"
              }`}
            >
              <div>
                <h2
                  className={`text-sm text-slate-900 ${
                    item.is_read ? "font-medium" : "font-semibold"
                  }`}
                >
                  {item.title}
                </h2>
                <p className="mt-1 text-sm text-slate-600">{item.message}</p>
                <p className="mt-1.5 text-xs text-slate-400">
                  {formatNotificationTime(item.created_at)}
                </p>
              </div>
              {!item.is_read && (
                <button
                  type="button"
                  onClick={() => void markRead(item.id)}
                  className="shrink-0 text-xs font-medium text-amber-700 hover:underline"
                >
                  Mark as read
                </button>
              )}
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
