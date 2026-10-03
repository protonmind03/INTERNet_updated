import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { API_URL } from "../lib/api";

type Role = "coordinator" | "student" | "supervisor";

type LiveNotification = {
  id: number;
  title: string;
  message: string;
  type: string;
};

const RETRY_MIN_MS = 5_000;
const RETRY_MAX_MS = 60_000;

function activeRoleForPath(path: string): Role | null {
  if (path === "/" || path.startsWith("/forgot-password") || path.startsWith("/reset-password")) {
    return null;
  }
  if (path.startsWith("/coordinator")) return "coordinator";
  if (path.startsWith("/supervisor")) return "supervisor";
  if (path === "/notifications" || path.startsWith("/student")) return "student";
  const activeRole = localStorage.getItem("active_role");
  if (
    (activeRole === "student" ||
      activeRole === "supervisor" ||
      activeRole === "coordinator") &&
    localStorage.getItem(`${activeRole}_token`)
  ) {
    return activeRole;
  }
  return null;
}

export default function RealtimeNotificationBridge() {
  const location = useLocation();
  const navigate = useNavigate();
  const [notification, setNotification] = useState<LiveNotification | null>(null);

  // The stream belongs to the signed-in role, not to the page: moving between
  // pages of the same portal keeps the one connection open.
  const streamRole = activeRoleForPath(location.pathname);
  const signedIn = Boolean(streamRole && localStorage.getItem(`${streamRole}_token`));

  useEffect(() => {
    const role = streamRole;
    if (!role || !signedIn) return;

    const controller = new AbortController();
    let reconnectTimer: number | undefined;
    // Wait longer after each failed attempt, so a server that is down is
    // not asked again every few seconds by every open tab.
    let retryDelay = RETRY_MIN_MS;
    const scheduleReconnect = () => {
      if (controller.signal.aborted) return;
      if (!navigator.onLine) {
        // No connection: wait for it to return instead of retrying blind.
        window.addEventListener("online", () => void connect(), {
          once: true,
          signal: controller.signal,
        });
        return;
      }
      const jitter = Math.random() * 1000;
      reconnectTimer = window.setTimeout(connect, retryDelay + jitter);
      retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
    };
    const connect = async () => {
      // Read the token on every attempt: a password change replaces it, and
      // reconnecting with the old one would be refused forever.
      const currentToken = localStorage.getItem(`${role}_token`);
      if (!currentToken) return;
      try {
        const response = await fetch(`${API_URL}/api/events`, {
          headers: { Authorization: `Bearer ${currentToken}` },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(`Live notification connection failed (${response.status}).`);
        }
        retryDelay = RETRY_MIN_MS;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split(/\r?\n\r?\n/);
          buffer = events.pop() || "";
          for (const eventText of events) {
            const eventName =
              eventText.match(/^event:\s*(.+)$/m)?.[1]?.trim() || "message";
            const data = eventText.match(/^data:\s*(.+)$/m)?.[1];
            if (eventName !== "notification" || !data) continue;
            const payload = JSON.parse(data) as LiveNotification;
            setNotification(payload);
            window.dispatchEvent(
              new CustomEvent("internet-notification", { detail: payload })
            );
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("LIVE NOTIFICATION STREAM ERROR:", error);
        }
      }
      scheduleReconnect();
    };

    void connect();
    return () => {
      controller.abort();
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
    };
  }, [streamRole, signedIn]);

  useEffect(() => {
    if (!notification) return;
    const timer = window.setTimeout(() => setNotification(null), 8000);
    return () => window.clearTimeout(timer);
  }, [notification]);

  if (!notification) return null;
  const role = activeRoleForPath(location.pathname);
  const target =
    role === "student"
      ? "/notifications"
      : role === "supervisor"
        ? "/supervisor/notifications"
        : "/coordinator/dashboard";

  return (
    <aside
      role="status"
      aria-live="polite"
      className="fixed right-4 top-4 z-[60] w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-slate-200 border-l-4 border-l-gold-400 bg-white p-4 shadow-xl"
    >
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => setNotification(null)}
        className="absolute right-3 top-2 text-slate-400 hover:text-slate-700"
      >
        ×
      </button>
      <button
        type="button"
        onClick={() => {
          navigate(target);
          setNotification(null);
        }}
        className="block pr-6 text-left"
      >
        <span className="block text-sm font-semibold text-slate-900">
          {notification.title}
        </span>
        <span className="mt-1 block text-xs text-slate-600">
          {notification.message}
        </span>
      </button>
    </aside>
  );
}
