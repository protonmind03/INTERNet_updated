import { useEffect, useState } from "react";
import { QUEUE_CHANGED, QUEUE_TRIED, waitingSteps } from "./offlineQueue";

/**
 * How many attendance steps are waiting on this phone to be sent (Iteration
 * 12), kept up to date. The header shows it on the account button, so it can
 * be seen while the "Waiting to send" panel is scrolled out of view.
 */
export function useWaitingCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let current = true;
    const read = () =>
      void waitingSteps().then((steps) => {
        if (current) setCount(steps.length);
      });
    read();
    window.addEventListener(QUEUE_CHANGED, read);
    window.addEventListener(QUEUE_TRIED, read);
    return () => {
      current = false;
      window.removeEventListener(QUEUE_CHANGED, read);
      window.removeEventListener(QUEUE_TRIED, read);
    };
  }, []);
  return count;
}
