import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "./toast";
import { spotlight } from "./spotlight";

/**
 * The record a link asks the page to show: `?focus=task-12` gives
 * "task-12". Notifications carry it, so a tap lands on the thing itself.
 * Null when the address names none, or names it in a form not expected.
 */
export function useFocus(): string | null {
  const [params] = useSearchParams();
  const focus = params.get("focus") || "";
  return /^[a-z_]{1,30}-[\w-]{1,80}$/.test(focus) ? focus : null;
}

/** The id of a focused record of one kind: "12" for `task-12` when kind is "task". */
export function focusId(focus: string | null, kind: string): string | null {
  return focus && focus.startsWith(`${kind}-`) ? focus.slice(kind.length + 1) : null;
}

/**
 * Brings the focused record into view and outlines it for a few seconds.
 * The page marks each row with `id={recordId("task", task.id)}`. `ready`
 * is true once the rows are on the page. If the record is not among them
 * (filtered out, or removed since), a toast says so.
 */
export function useFocusRecord(ready: boolean): string | null {
  const focus = useFocus();

  useEffect(() => {
    if (!ready || !focus) return;
    // After this render's rows are in the page.
    const frame = window.requestAnimationFrame(() => {
      const row = document.getElementById(`record-${focus}`);
      if (!row) {
        toast.info("That item is not shown here. It may be hidden by a filter, or it was removed.");
        return;
      }
      // Iteration 21: the same spotlight a notification's ?spot= gets (lib/spotlight.ts).
      // A ?spot= on the same address spotlights its own target instead.
      if (new URLSearchParams(window.location.search).get("spot")) return;
      spotlight(row);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [ready, focus]);

  return focus;
}

export const recordId = (kind: string, id: string | number) => `record-${kind}-${id}`;
