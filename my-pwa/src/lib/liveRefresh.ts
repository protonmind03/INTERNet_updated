import { useEffect, useRef } from "react";

/*
|--------------------------------------------------------------------------
| LIVE REFRESH
|--------------------------------------------------------------------------
|
| When a list on screen should be fetched again (sv10-26: the supervisor's
| "To verify" kept current without a reload):
|
|   - a live notification arrived (components/RealtimeNotificationBridge);
|   - something was saved in this tab, or in another tab of the same
|     browser (notifyDataChanged, carried across tabs by a
|     BroadcastChannel);
|   - the tab came back into view, or the device came back online;
|   - and, as the net under all of these, every `everyMs` while the tab is
|     in view: the live stream can drop silently (a phone that slept, a
|     proxy that cut it) and the list must not go stale meanwhile.
|
*/

export const DATA_CHANGED_EVENT = "internet-data-changed";
const CHANNEL = "internet-data";

let channel: BroadcastChannel | null | undefined;
function sharedChannel(): BroadcastChannel | null {
  if (channel === undefined) {
    try {
      channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(CHANNEL) : null;
      // Another tab saved something: say so here as if it had happened in this tab.
      channel?.addEventListener("message", () => window.dispatchEvent(new Event(DATA_CHANGED_EVENT)));
    } catch {
      channel = null;
    }
  }
  return channel;
}

/** Call after saving something that changes what lists or counts show; other open tabs hear it too. */
export function announceDataChanged(): void {
  window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
  try {
    sharedChannel()?.postMessage({ at: Date.now() });
  } catch {
    /* A closed channel: this tab already knows. */
  }
}

/**
 * Calls `refresh` on each of the moments above. `everyMs` is the fallback
 * interval while the tab is visible (0 turns it off). The callback may
 * change between renders; the latest one is used.
 */
export function useLiveRefresh(refresh: () => void, everyMs = 30_000, enabled = true): void {
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  });

  useEffect(() => {
    if (!enabled) return;
    sharedChannel();
    const run = () => latest.current();
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    window.addEventListener("internet-notification", run);
    window.addEventListener(DATA_CHANGED_EVENT, run);
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    const timer =
      everyMs > 0
        ? window.setInterval(() => {
            if (document.visibilityState === "visible" && navigator.onLine !== false) run();
          }, everyMs)
        : 0;
    return () => {
      window.removeEventListener("internet-notification", run);
      window.removeEventListener(DATA_CHANGED_EVENT, run);
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
      if (timer) window.clearInterval(timer);
    };
  }, [everyMs, enabled]);
}
