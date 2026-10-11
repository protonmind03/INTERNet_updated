import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

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
 * is true once the rows are on the page; nothing happens if the record is
 * not among them (it may have been removed since).
 */
export function useFocusRecord(ready: boolean): string | null {
  const focus = useFocus();

  useEffect(() => {
    if (!ready || !focus) return;
    // After this render's rows are in the page.
    const frame = window.requestAnimationFrame(() => {
      const row = document.getElementById(`record-${focus}`);
      if (!row) return;
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      row.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
      row.classList.add("record-focus");
      window.setTimeout(() => row.classList.remove("record-focus"), 4000);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [ready, focus]);

  return focus;
}

export const recordId = (kind: string, id: string | number) => `record-${kind}-${id}`;
