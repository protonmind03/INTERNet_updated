import { useCallback, useRef } from "react";

/*
| The sidebars' scrolling list (roadmap 5.8, class .inb-scroll-pane in
| index.css). The class does the look; this says what the CSS cannot know:
| whether there is more to scroll above or below (for the edge fades, shown
| only then) and whether it is scrolling now (the bar at full contrast).
*/

const SCROLLING_HOLD_MS = 800;

/** A ref for the scrolling element. Watches its size and its content's. */
export function useScrollPane<T extends HTMLElement>() {
  const cleanup = useRef<(() => void) | null>(null);

  return useCallback((element: T | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!element) return;

    let timer = 0;
    // A sideways row (data-axis="x") has its edges left and right.
    const sideways = element.dataset.axis === "x";
    const edges = () => {
      const at = sideways ? element.scrollLeft : element.scrollTop;
      const more = sideways ? element.scrollWidth - element.clientWidth : element.scrollHeight - element.clientHeight;
      element.toggleAttribute("data-more-above", at > 1);
      element.toggleAttribute("data-more-below", more > 1 && at < more - 1);
    };
    const onScroll = () => {
      edges();
      element.setAttribute("data-scrolling", "");
      window.clearTimeout(timer);
      timer = window.setTimeout(() => element.removeAttribute("data-scrolling"), SCROLLING_HOLD_MS);
    };

    edges();
    element.addEventListener("scroll", onScroll, { passive: true });
    // A taller window, a longer list (a count badge, a new item) changes the edges too.
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(edges);
    resize?.observe(element);
    for (const child of Array.from(element.children)) resize?.observe(child);

    cleanup.current = () => {
      element.removeEventListener("scroll", onScroll);
      resize?.disconnect();
      window.clearTimeout(timer);
    };
  }, []);
}
