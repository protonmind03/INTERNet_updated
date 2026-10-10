import { useEffect } from "react";

type Sentinel = { release: () => Promise<void> };
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<Sentinel> };
};

/**
 * Keeps the screen from dimming or locking while `active` is true, for
 * moments when someone is looking at the phone without touching it (the
 * camera check). The browser drops the lock whenever the page is hidden, so
 * it is asked for again when the page comes back. Where the browser has no
 * wake lock, or refuses (low battery), nothing happens and nothing is shown.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    const wakeLock = (navigator as WakeLockNavigator).wakeLock;
    if (!active || !wakeLock) return;

    let wanted = true;
    let sentinel: Sentinel | null = null;

    const acquire = async () => {
      if (!wanted || document.visibilityState !== "visible") return;
      try {
        const next = await wakeLock.request("screen");
        if (wanted) sentinel = next;
        else void next.release().catch(() => {});
      } catch {
        /* Refused: the screen simply follows the phone's own timeout. */
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      wanted = false;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}
