import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { API_URL } from "../lib/api";
import { cue } from "../lib/cues";
import { resolveNotificationTarget } from "../lib/notificationTargets";
import { toast } from "../lib/toast";

type Role = "coordinator" | "student" | "supervisor";

type LiveNotification = {
  id: number;
  title: string;
  message: string;
  type: string;
  /** The page it is about, stored by the server. */
  link?: string | null;
  /** The record it is about. */
  entity_type?: string | null;
  entity_id?: string | number | null;
};

/** The full notification list for each portal: where "View" leads. */
const NOTIFICATION_PAGE: Record<Role, string> = {
  student: "/notifications",
  supervisor: "/supervisor/notifications",
  coordinator: "/coordinator/notifications",
};

const RETRY_MIN_MS = 5_000;
const RETRY_MAX_MS = 60_000;
/**
 * The server says something (a keep-alive at least) every 25 seconds. A
 * stream silent for this long has died without closing (a phone that slept,
 * a network that changed): it is dropped and opened again.
 */
const SILENT_MS = 60_000;

/** The last notification id this tab has seen, per role, so a reconnect can ask for what came after it. */
const lastSeenKey = (role: Role) => `inb_live_last_${role}`;
function readLastSeen(role: Role): number | null {
  try {
    const value = Number(sessionStorage.getItem(lastSeenKey(role)));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}
function writeLastSeen(role: Role, id: number): void {
  try {
    if (id > (readLastSeen(role) ?? 0)) sessionStorage.setItem(lastSeenKey(role), String(id));
  } catch {
    /* Storage blocked: a reconnect then simply starts from now. */
  }
}

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

/**
 * Keeps the live notification stream open while someone is signed in. Each
 * notification that arrives is announced to the pages that list them and
 * shown as a toast with a "View" action, so it shares the toasts' place on
 * screen and never covers a header or an open dialog. Renders nothing.
 */
export default function RealtimeNotificationBridge() {
  const location = useLocation();
  const navigate = useNavigate();
  // The stream outlives page changes; this keeps "View" on the current router.
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

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
      // This connection's own switch: the watchdog below can drop it without
      // ending the whole stream (the page's own controller).
      const connection = new AbortController();
      const stop = () => connection.abort();
      controller.signal.addEventListener("abort", stop, { once: true });
      let heardAt = Date.now();
      const watchdog = window.setInterval(() => {
        if (Date.now() - heardAt > SILENT_MS) connection.abort();
      }, 15_000);
      try {
        // After a drop, ask for what arrived meanwhile (Iteration 16).
        const after = readLastSeen(role);
        const response = await fetch(`${API_URL}/api/events${after ? `?after=${after}` : ""}`, {
          headers: { Authorization: `Bearer ${currentToken}` },
          signal: connection.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(`Live notification connection failed (${response.status}).`);
        }
        retryDelay = RETRY_MIN_MS;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!connection.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          heardAt = Date.now();
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split(/\r?\n\r?\n/);
          buffer = events.pop() || "";
          for (const eventText of events) {
            const eventName =
              eventText.match(/^event:\s*(.+)$/m)?.[1]?.trim() || "message";
            const data = eventText.match(/^data:\s*(.+)$/m)?.[1];
            const eventId = Number(eventText.match(/^id:\s*(\d+)$/m)?.[1]);
            if (eventName === "catchup" && data) {
              const missed = JSON.parse(data) as { notifications: LiveNotification[]; more: boolean };
              const fresh = missed.notifications.filter((item) => item.id > (readLastSeen(role) ?? 0));
              if (Number.isInteger(eventId)) writeLastSeen(role, eventId);
              if (fresh.length === 0) continue;
              // One toast for all of them, not a burst of them.
              if (role !== "student") cue("attention");
              const count = missed.more ? `${fresh.length}+` : String(fresh.length);
              toast.notice(
                fresh.length === 1 ? fresh[0].title : `${count} new notifications`,
                fresh.length === 1 ? fresh[0].message : "They arrived while the connection was down.",
                { label: "View", onClick: () => navigateRef.current(NOTIFICATION_PAGE[role]) }
              );
              window.dispatchEvent(new CustomEvent("internet-notification", { detail: fresh[fresh.length - 1] }));
              continue;
            }
            if (eventName !== "notification" || !data) continue;
            const payload = JSON.parse(data) as LiveNotification;
            // Already shown (it also came in a catch-up): not again.
            if (payload.id <= (readLastSeen(role) ?? 0)) continue;
            writeLastSeen(role, payload.id);
            // Something new to look at, for those who review. Students get no cue for this.
            if (role !== "student") cue("attention");
            toast.notice(payload.title, payload.message, {
              label: "View",
              // Straight to what it is about; anything without a page opens
              // the full list.
              onClick: () => {
                const { path } = resolveNotificationTarget(role, payload);
                navigateRef.current(path ?? NOTIFICATION_PAGE[role]);
                if (!path) toast.info("That notification has no page of its own, so here is the full list.");
              },
            });
            window.dispatchEvent(
              new CustomEvent("internet-notification", { detail: payload })
            );
          }
        }
      } catch (error) {
        // A connection the watchdog dropped is not an error worth reporting.
        if (!controller.signal.aborted && !connection.signal.aborted) {
          console.error("LIVE NOTIFICATION STREAM ERROR:", error);
        }
      } finally {
        window.clearInterval(watchdog);
        controller.signal.removeEventListener("abort", stop);
      }
      scheduleReconnect();
    };

    void connect();
    return () => {
      controller.abort();
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
    };
  }, [streamRole, signedIn]);

  return null;
}
