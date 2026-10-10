import { useEffect, useState } from "react";

/*
|--------------------------------------------------------------------------
| FIXED LAYERS
|--------------------------------------------------------------------------
|
| Things pinned to an edge of the screen (the offline strip, the student
| tab bar, the push prompt) publish their height as a CSS variable, and
| whatever floats near that edge is positioned from it. Nothing has to know
| another layer's size, so nothing covers anything else. The variables and
| the stacking order are listed in index.css under "Fixed layers".
|
*/

/**
 * Publishes an element's height (plus `gap` pixels) as a CSS variable on the
 * page while the element is shown, and withdraws it when the element goes.
 * Returns the ref to put on the element.
 */
export function useReportedHeight<T extends HTMLElement>(variable: string, gap = 0) {
  const [element, setElement] = useState<T | null>(null);

  useEffect(() => {
    if (!element) return;
    const root = document.documentElement;
    const report = () => {
      // A hidden element (the tab bar on a wide screen) has no height; the
      // variable then falls back to its default in index.css.
      const height = element.offsetHeight;
      if (height > 0) root.style.setProperty(variable, `${height + gap}px`);
      else root.style.removeProperty(variable);
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty(variable);
    };
  }, [element, variable, gap]);

  return setElement;
}
