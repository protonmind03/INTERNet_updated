import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import Icon, { type IconName } from "./Icon";
import { useReportedHeight } from "../lib/layers";

/*
|--------------------------------------------------------------------------
| THE DOCK (phones, every role)
|--------------------------------------------------------------------------
|
| Iteration 21, made shared by the PSU redesign. Below 768 px each portal's
| pages are reached from a dock floating 12 px from the screen's edges:
| four destinations and More. Its colours are the role's (--role-dock*):
| cream with an amber pill for the trainee, green with a white pill for the
| supervisor, navy with a gold pill for the coordinator. Icons always; only
| the current page's label shows, in a pill that widens over 200 ms. It
| hides while the page scrolls down and comes back on the way up, and
| while the on-screen keyboard is open. Its height is published as
| --inb-bottom-bar (lib/layers.ts), so floating buttons and toasts rest
| above it.
|
| More is a grouped sheet (the trainee's My OJT, Messages, Support; each
| role names its own), with the account and Sign out at the bottom.
|
*/

export type DockItem = { label: string; path: string; icon: IconName; count?: number; testId?: string; badge?: ReactNode };
export type DockGroup = { label: string; items: DockItem[] };

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
    const later = () => window.setTimeout(check, 50);
    viewport?.addEventListener("resize", check);
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", later);
    return () => {
      viewport?.removeEventListener("resize", check);
      document.removeEventListener("focusin", check);
      document.removeEventListener("focusout", later);
    };
  }, []);
  return open;
}

const isOn = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);

export default function RoleDock({
  items,
  groups,
  account,
  search,
  scroller,
}: {
  items: DockItem[];
  groups: DockGroup[];
  /** The account row at the bottom of More. */
  account: { initials: string; name: string; detail: string; onSignOut: () => void };
  /** A search field at the top of More (the coordinator's "Find anyone"). */
  search?: (close: () => void) => ReactNode;
  /** The element the page scrolls in, if not the window. */
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
    const target: HTMLElement | Window = scroller ?? window;
    const position = () => (scroller ? scroller.scrollTop : window.scrollY);
    last.current = position();
    const onScroll = () => {
      const now = position();
      if (Math.abs(now - last.current) < THRESHOLD) return;
      setHidden(now > last.current && now > 48);
      last.current = now;
    };
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, [scroller]);

  // A new page starts with the dock in view.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setHidden(false));
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  const more = groups.flatMap((group) => group.items);
  const moreActive = more.some((item) => isOn(pathname, item.path));
  const moreCount = more.reduce((sum, item) => sum + (item.count ?? 0), 0);
  const gone = hidden || keyboard;

  return (
    <>
      <nav ref={keyboard ? undefined : report} aria-label="Main" className={`role-dock md:hidden print:hidden ${gone ? "role-dock--hidden" : ""}`} aria-hidden={gone || undefined}>
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            aria-label={item.count ? `${item.label}, ${item.count} new` : item.label}
            tabIndex={gone ? -1 : undefined}
            className={({ isActive }) => `role-dock-item ${isActive ? "role-dock-item--on" : ""}`}
          >
            <span className="relative inline-flex">
              <Icon name={item.icon} size={22} />
              {item.count ? (
                <span aria-hidden="true" className="role-dock-badge tabular">
                  {item.count > 9 ? "9+" : item.count}
                </span>
              ) : null}
              {item.badge}
            </span>
            <span className="role-dock-label" aria-hidden="true">
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
          className={`role-dock-item ${moreActive ? "role-dock-item--on" : ""}`}
        >
          <span className="relative inline-flex">
            <Icon name="more" size={22} />
            {moreCount ? (
              <span aria-hidden="true" className="role-dock-badge tabular">
                {moreCount > 9 ? "9+" : moreCount}
              </span>
            ) : null}
          </span>
          <span className="role-dock-label" aria-hidden="true">
            More
          </span>
        </button>
      </nav>
      {sheet &&
        createPortal(
          <MoreSheet
            groups={groups}
            account={account}
            search={search}
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

function MoreSheet({
  groups,
  account,
  search,
  onClose,
  onGo,
}: {
  groups: DockGroup[];
  account: { initials: string; name: string; detail: string; onSignOut: () => void };
  search?: (close: () => void) => ReactNode;
  onClose: () => void;
  onGo: (path: string) => void;
}) {
  const sheet = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    sheet.current?.querySelector<HTMLElement>("input, button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop fixed inset-0 z-(--z-drawer) flex items-end md:hidden" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={sheet} role="dialog" aria-modal="true" aria-label="More" className="more-sheet animate-sheet-in">
        <div aria-hidden="true" className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300" />
        {search?.(onClose)}
        <div className="max-h-[62dvh] overflow-y-auto pb-1">
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <p className="eyebrow more-sheet-group">{group.label}</p>
              <ul className="more-sheet-grid">
                {group.items.map((item) => (
                  <li key={item.path}>
                    <button type="button" onClick={() => onGo(item.path)} className="more-sheet-item" data-testid={item.testId}>
                      <span className="more-sheet-tile">
                        <Icon name={item.icon} size={21} />
                        {item.count ? (
                          <span aria-hidden="true" className="role-dock-badge tabular">
                            {item.count > 9 ? "9+" : item.count}
                          </span>
                        ) : null}
                      </span>
                      <span className="more-sheet-label">
                        {item.label}
                        {item.count ? <span className="sr-only">, {item.count} new</span> : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="more-sheet-account">
          <span className="more-sheet-avatar" aria-hidden="true">
            {account.initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold text-slate-900">{account.name}</span>
            <span className="block truncate text-[13px] text-slate-600">{account.detail}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              onClose();
              account.onSignOut();
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-red-700 hover:bg-red-50"
          >
            <Icon name="logout" size={18} />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
