import { useEffect, useSyncExternalStore } from "react";
import { API_URL } from "./api";

/*
|--------------------------------------------------------------------------
| CAN THE SERVER BE REACHED?
|--------------------------------------------------------------------------
|
| Iteration 12. A phone says it is "online" the moment it joins a network,
| often before a request can get through (a captive portal, a weak signal,
| a server that is restarting). So "online" is only a hint here: the
| answer comes from asking the server's /api/health and waiting at most
| 3 seconds for it.
|
| While the server cannot be reached it is asked again, a little less often
| each time: after 3 seconds, then 6, 12, and so on up to once a minute.
| Once it answers the asking stops, and starts again when the phone reports
| a change (online, offline, the app brought back to the front) or a
| request fails (markUnreachable).
|
| The offline queue (lib/offlineQueue.ts) is sent only when this says the
| server can be reached.
|
*/

export type Reachability = {
  /** null until the first answer. */
  reachable: boolean | null;
  /** When it was last asked, ISO; null before the first time. */
  checkedAt: string | null;
};

/** How long the server has to answer before it counts as out of reach. */
export const HEALTH_TIMEOUT_MS = 3_000;
const RETRY_FIRST_MS = 3_000;
const RETRY_MAX_MS = 60_000;

let state: Reachability = { reachable: null, checkedAt: null };
const listeners = new Set<() => void>();
let checking: Promise<boolean> | null = null;
let retryTimer = 0;
let retryDelay = 0;
let watching = false;

function set(next: Reachability): void {
  const changed = next.reachable !== state.reachable;
  state = next;
  for (const listener of listeners) listener();
  if (changed) window.dispatchEvent(new CustomEvent(REACHABILITY_CHANGED, { detail: next.reachable }));
}

/** Sent on window when the answer changes; `detail` is the new answer. */
export const REACHABILITY_CHANGED = "internet-reachability";

function scheduleRetry(): void {
  window.clearTimeout(retryTimer);
  retryDelay = retryDelay ? Math.min(retryDelay * 2, RETRY_MAX_MS) : RETRY_FIRST_MS;
  retryTimer = window.setTimeout(() => void checkReachable(), retryDelay);
}

/** Asks the server now (or joins the question already being asked). True when it answered. */
export function checkReachable(): Promise<boolean> {
  checking ??= (async () => {
    let ok = false;
    // The phone's "offline" is believed: there is no point asking.
    if (navigator.onLine) {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
      try {
        const response = await fetch(`${API_URL}/api/health`, { cache: "no-store", signal: controller.signal });
        ok = response.ok;
      } catch {
        ok = false;
      } finally {
        window.clearTimeout(timer);
      }
    }
    set({ reachable: ok, checkedAt: new Date().toISOString() });
    if (ok) {
      window.clearTimeout(retryTimer);
      retryDelay = 0;
    } else if (watching) {
      scheduleRetry();
    }
    return ok;
  })().finally(() => {
    checking = null;
  });
  return checking;
}

/** Said by code whose request could not get through: the asking starts again. */
export function markUnreachable(): void {
  if (state.reachable === false) return;
  set({ reachable: false, checkedAt: new Date().toISOString() });
  if (watching) scheduleRetry();
}

/** The last answer, without asking. */
export function lastReachability(): Reachability {
  return state;
}

/** Starts listening for the moments worth asking again. Safe to call more than once. */
export function watchReachability(): void {
  if (watching) return;
  watching = true;
  const fresh = () => {
    // A change of network: start the waits over.
    retryDelay = 0;
    void checkReachable();
  };
  window.addEventListener("online", fresh);
  window.addEventListener("offline", fresh);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") fresh();
  });
  void checkReachable();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether the server answers, kept up to date while the component is shown. */
export function useReachability(): Reachability {
  useEffect(() => {
    watchReachability();
  }, []);
  return useSyncExternalStore(subscribe, () => state);
}
