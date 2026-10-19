import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

/*
|--------------------------------------------------------------------------
| TOOLTIP
|--------------------------------------------------------------------------
|
| A short label for an icon, shown only to a mouse hovering it or to the
| keyboard focusing it (:focus-visible). Never on touch: there the icon acts
| at once, and its name is its aria-label. Iteration 21.
|
| It closes on scroll, on a route change, on a press anywhere else, on
| Escape, and after 1.5 s at most. While closed it is not in the page at
| all, so nothing is left behind on a phone.
|
| For supplementary hints only: anything the user must know belongs in
| visible text.
|
*/

const MAX_OPEN_MS = 1500;

export default function Tooltip({
  label,
  side = "top",
  children,
  className = "",
}: {
  label: string;
  side?: "top" | "bottom" | "left";
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLSpanElement | null>(null);
  // Focus that follows a press (a tap, a click) is not keyboard focus.
  const pressedAt = useRef(0);
  const position = {
    top: "bottom-full left-1/2 mb-1.5 -translate-x-1/2",
    bottom: "left-1/2 top-full mt-1.5 -translate-x-1/2",
    left: "right-full top-1/2 mr-1.5 -translate-y-1/2",
  }[side];

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(close, MAX_OPEN_MS);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onPress = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) close();
    };
    window.addEventListener("scroll", close, { capture: true, passive: true });
    window.addEventListener("popstate", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPress, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("popstate", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPress, true);
    };
  }, [open, close]);

  // A route change unmounts most pages; one that keeps this mounted still closes it.
  useEffect(() => {
    if (!open) return;
    const path = window.location.pathname;
    const check = window.setInterval(() => {
      if (window.location.pathname !== path) close();
    }, 200);
    return () => window.clearInterval(check);
  }, [open, close]);

  return (
    <span
      ref={wrapper}
      className={`relative inline-flex ${className}`}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setOpen(true);
      }}
      onPointerLeave={close}
      onPointerDown={() => {
        // A tap or a press acts; it never opens the label.
        pressedAt.current = Date.now();
        close();
      }}
      onFocus={(event) => {
        // Keyboard focus (and a page moving focus here) shows it; focus from a press does not.
        const target = event.target as HTMLElement;
        const pressed = Date.now() - pressedAt.current < 600;
        if (!pressed && target.matches?.(":focus")) setOpen(true);
      }}
      onBlur={close}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open && (
        <span
          id={id}
          role="tooltip"
          className={`inb-tooltip pointer-events-none absolute z-50 w-max max-w-56 rounded-md bg-slate-900 px-2 py-1 text-center text-xs font-medium leading-snug text-white shadow-lg ${position}`}
        >
          {label}
        </span>
      )}
    </span>
  );
}
