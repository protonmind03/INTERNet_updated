import type { ReactNode } from "react";

/*
| The panels of components/InternPanels.tsx, worked out from a page's items:
| one per intern, with how many items wait and since when.
*/

export type InternPanel<T> = {
  id: string;
  name: string;
  block?: string | null;
  items: T[];
  /** Items waiting for a decision. */
  waiting: number;
  /** When the longest-waiting of them came in. */
  oldestWaiting: string | null;
  /** Shown at the top of the open panel, above the items (a progress line, for example). */
  summary?: ReactNode;
};

/** Groups a page's items by intern, in the order they come, with what waits in each. */
export function panelsByIntern<T>(
  items: T[],
  of: {
    student: (item: T) => { id: string; name: string };
    /** When the item started waiting, or null when it is not waiting. */
    waitingSince: (item: T) => string | null;
    block?: (studentId: string) => string | null | undefined;
  },
  /** Interns to show even with no items (a progress list, for example). */
  everyone: { id: string; name: string }[] = []
): InternPanel<T>[] {
  const panels = new Map<string, InternPanel<T>>();
  const panelFor = (id: string, name: string) => {
    const key = String(id);
    let panel = panels.get(key);
    if (!panel) {
      panel = { id: key, name, block: of.block?.(key) ?? null, items: [], waiting: 0, oldestWaiting: null };
      panels.set(key, panel);
    }
    return panel;
  };
  for (const person of everyone) panelFor(person.id, person.name);
  for (const item of items) {
    const who = of.student(item);
    const panel = panelFor(who.id, who.name);
    panel.items.push(item);
    const since = of.waitingSince(item);
    if (since) {
      panel.waiting += 1;
      if (!panel.oldestWaiting || new Date(since) < new Date(panel.oldestWaiting)) panel.oldestWaiting = since;
    }
  }
  return [...panels.values()];
}

/** Waiting panels first, the oldest wait at the top; then the rest by name. */
export function sortPanels<T>(panels: InternPanel<T>[]): InternPanel<T>[] {
  return panels.slice().sort((a, b) => {
    if ((a.waiting > 0) !== (b.waiting > 0)) return a.waiting > 0 ? -1 : 1;
    if (a.oldestWaiting && b.oldestWaiting && a.oldestWaiting !== b.oldestWaiting) {
      return new Date(a.oldestWaiting).getTime() - new Date(b.oldestWaiting).getTime();
    }
    return a.name.localeCompare(b.name);
  });
}
