import { useEffect } from "react";

/**
 * Tells the launch screen (brand/SplashScreen.tsx, LaunchGate) that the page
 * behind it has its first data, so it can leave instead of waiting out its
 * timer. Each role's landing page calls this with "not loading any more".
 * Calling it when no launch screen is showing does nothing.
 */
export function useLaunchReady(ready: boolean): void {
  useEffect(() => {
    if (ready) window.dispatchEvent(new Event("inb:ready"));
  }, [ready]);
}
