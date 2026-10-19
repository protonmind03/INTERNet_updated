import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import Icon, { type IconName } from "./Icon";
import { useReportedHeight } from "../lib/layers";

/*
|--------------------------------------------------------------------------
| THE TRAINEE'S DOCK (phones)
|--------------------------------------------------------------------------
|
| Iteration 21. Below 768 px the trainee's pages are reached from a dock
| floating 12 px from the screen's edges: Today, Attendance, Schedule,
| Tasks, and More (Documents, Weekly report, Resolution Center, Help, in a
| sheet). Icons always; only the current page's label shows, in a pill that
| widens over 200 ms, so nothing is squeezed at 320 px. It hides while the
| page scrolls down and comes back on the way up (12 px either way), and
| while the on-screen keyboard is open. Its height is published as
| --inb-bottom-bar (lib/layers.ts), so the floating button and toasts rest
| above it.
|
*/

export type DockItem = { label: string; path: string; icon: IconName; count?: number };

const THRESHOLD = 12;

/** True while an on-screen keyboard is likely open: a text field has focus and the visible area shrank. */
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    const check = () => {
      const active = document.activeElement as HTMLElement | null;
      const typing = Boolean(active?.matches?.("input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select, [contenteditable=true]"));
      const shrunk = viewport ? window.innerHeight - viewport.height > 120 : false;
      setOpen(typing && (shrunk || !viewport));
    };
    viewport?.addEventListener("resize", check);
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", () => window.setTimeout(check, 50));
    return () => {
      viewport?.removeEventListener("resize", check);
      document.removeEventListener("focusin", check);
    };
  }, []);
  return open;
}

export default function StudentDock({
  items,
  more,
  scroller,
}: {
  items: DockItem[];
  more: DockItem[];
  /** The element the page scrolls in (the layout's <main>). */
  scroller: HTMLElement | null;
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(false);
  const [sheet, setSheet] = useState(false);
  const keyboard = useKeyboardOpen();
  const report = useReportedHeight<HTMLElement>("--inb-bottom-bar", 12);
  const last = useRef(0);

  useEffect(() => {
    if (!scroller) return;
    last.current = scroller.scrollTop;
    const onScroll = () => {
      const now = scroller.scrollTop;
      if (Math.abs(now - last.current) < THRESHOLD) return;
      setHidden(now > last.current && now > 48);
      last.current = now;
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [scroller]);

  // A new page starts with the dock in view.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setHidden(false));
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  const moreActive = more.some((item) => pathname === item.path || pathname.startsWith(`${item.path}/`));
  const moreCount = more.reduce((sum, item) => sum + (item.count ?? 0), 0);
  const gone = hidden || keyboard;

  return (
    <>
      <nav
        ref={keyboard ? undefined : report}
        aria-label="Main"
        className={`student-dock md:hidden print:hidden ${gone ? "student-dock--hidden" : ""}`}
        aria-hidden={gone || undefined}
      >
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            aria-label={item.count ? `${item.label}, ${item.count} new` : item.label}
            tabIndex={gone ? -1 : undefined}
            className={({ isActive }) => `student-dock-item ${isActive ? "student-dock-item--on" : ""}`}
          >
            <span className="relative inline-flex">
              <Icon name={item.icon} size={22} />
              {item.count ? <span aria-hidden="true" className="student-dock-badge tabular">{item.count > 9 ? "9+" : item.count}</span> : null}
            </span>
            <span className="student-dock-label" aria-hidden="true">
              {item.label}
            </span>
          </NavLink>
        ))}
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={sheet}
          aria-label={moreCount ? `More, ${moreCount} new` : "More"}
          tabIndex={gone ? -1 : undefined}
          onClick={() => setSheet(true)}
          className={`student-dock-item ${moreActive ? "student-dock-item--on" : ""}`}
        >
          <span className="relative inline-flex">
            <Icon name="more" size={22} />
            {moreCount ? <span aria-hidden="true" className="student-dock-badge tabular">{moreCount > 9 ? "9+" : moreCount}</span> : null}
          </span>
          <span className="student-dock-label" aria-hidden="true">
            More
          </span>
        </button>
      </nav>
      {sheet &&
        createPortal(
          <MoreSheet
            items={more}
            onClose={() => setSheet(false)}
            onGo={(path) => {
              setSheet(false);
              navigate(path);
            }}
          />,
          document.body
        )}
    </>
  );
}

function MoreSheet({ items, onClose, onGo }: { items: DockItem[]; onClose: () => void; onGo: (path: string) => void }) {
  const first = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop fixed inset-0 z-(--z-drawer) flex items-end md:hidden" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="More" className="w-full animate-sheet-in rounded-t-2xl bg-white p-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div aria-hidden="true" className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-slate-300" />
        <ul>
          {items.map((item, index) => (
            <li key={item.path}>
              <button
                ref={index === 0 ? first : undefined}
                type="button"
                onClick={() => onGo(item.path)}
                className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-base font-medium text-slate-800 hover:bg-slate-50"
              >
                <Icon name={item.icon} className="text-slate-500" />
                <span className="flex-1">{item.label}</span>
                {item.count ? <span className="tabular rounded-full bg-psu-950/10 px-2 text-xs font-bold text-slate-700">{item.count}</span> : null}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={onClose} className="mt-1 flex min-h-12 w-full items-center justify-center rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">
          Close
        </button>
      </div>
    </div>
  );
}
