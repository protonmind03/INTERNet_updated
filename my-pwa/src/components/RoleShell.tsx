import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { BrandIcon, PortalHeader, Wordmark, type Role } from "../brand";
import { BRAND } from "../brand/geometry";
import Icon, { type IconName } from "./Icon";
import RoleDock, { type DockGroup, type DockItem } from "./RoleDock";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useScrollPane } from "../lib/useScrollPane";

/*
|--------------------------------------------------------------------------
| ONE SHELL FOR THE THREE PORTALS (PSU redesign, Sections 7, 8, 10, 11)
|--------------------------------------------------------------------------
|
|   under 768 px     the role's flat header (page title, one context line,
|                    the bell) and the dock of four plus More
|   768 to 1279 px   a side menu in the role's colour, collapsed to a rail
|                    of icons; the toggle opens it with its labels
|   1280 px and up   the side menu whole
|
| Each layout (layouts/*Layout.tsx) gives its own menu: the trainee's
| sections, the supervisor's exclusive accordion with the company chip, the
| coordinator's text-first groups with search. The page itself scrolls
| (the window), so the dock and the header follow it.
|
*/

export type SideLeaf = { label: string; path: string; count?: number };
export type SideItem = {
  label: string;
  /** Where the item itself goes. A group with children and no path only opens. */
  path?: string;
  icon: IconName;
  count?: number;
  /** One quiet line under the label (the coordinator's text-first groups). */
  detail?: string;
  /** Collapsible children; only one group is open at a time. */
  children?: SideLeaf[];
  /** A small heading before this item. */
  section?: string;
  /** Other addresses that count as this item. */
  also?: string[];
};

const onPath = (pathname: string, path?: string) => Boolean(path) && (pathname === path || pathname.startsWith(`${path}/`));

function owns(item: SideItem, pathname: string): boolean {
  const bare = (path: string) => path.split("?")[0];
  return onPath(pathname, item.path) || (item.also ?? []).some((path) => onPath(pathname, path)) || (item.children ?? []).some((child) => onPath(pathname, bare(child.path)));
}

function SideMenu({
  items,
  top,
  account,
  collapsed,
  onToggle,
  canToggle,
}: {
  items: SideItem[];
  top?: ReactNode;
  account: { initials: string; name: string; detail: string; profilePath: string; onSignOut: () => void };
  collapsed: boolean;
  onToggle: () => void;
  canToggle: boolean;
}) {
  const { pathname, search } = useLocation();
  const pane = useScrollPane<HTMLElement>();
  const current = items.find((item) => item.children && owns(item, pathname))?.label ?? null;
  const [open, setOpen] = useState<string | null>(current);
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    if (current) setOpen(current);
  }

  return (
    <aside className="role-side print:hidden" data-collapsed={collapsed || undefined} aria-label="Side menu">
      <div className="role-side-brand">
        {!collapsed && (
          <span className="flex min-w-0 flex-1 items-center gap-2.5">
            <BrandIcon size={30} tile={BRAND.amber} fg={BRAND.navy} />
            <Wordmark height={14} tone="onDark" />
          </span>
        )}
        {canToggle && (
          <button type="button" className="role-side-toggle" onClick={onToggle} aria-expanded={!collapsed} aria-label={collapsed ? "Open the menu" : "Close the menu to icons"}>
            <Icon name={collapsed ? "chevrons-right" : "chevrons-left"} size={20} />
          </button>
        )}
      </div>
      {top && <div className="role-side-top">{top}</div>}
      <nav ref={pane} aria-label="Main" className="role-side-nav inb-scroll-pane">
        {items.map((item) => {
          const on = owns(item, pathname);
          const expanded = Boolean(item.children) && open === item.label;
          const label = (
            <>
              <Icon name={item.icon} size={20} className="shrink-0" />
              <span className="role-side-text min-w-0 flex-1">
                <span className="block truncate">{item.label}</span>
                {item.detail && <span className="role-side-detail truncate">{item.detail}</span>}
              </span>
              {item.count ? (
                <span className="role-side-count" aria-label={`${item.count} waiting`}>
                  {item.count > 99 ? "99+" : item.count}
                </span>
              ) : null}
            </>
          );
          return (
            <div key={item.label} className="role-side-group">
              {item.section && !collapsed && <p className="eyebrow mb-1.5 mt-4 px-3 text-white/70">{item.section}</p>}
              {item.children && !collapsed ? (
                <>
                  {item.path ? (
                    // A group that is also a page (the supervisor's Review): the name goes there, the chevron opens it.
                    <div className="flex items-center">
                      <Link to={item.path} className="role-side-link min-w-0 flex-1" aria-current={onPath(pathname, item.path) && !search ? "page" : undefined}>
                        {label}
                      </Link>
                      <button
                        type="button"
                        className="role-side-toggle"
                        aria-expanded={expanded}
                        aria-label={`${expanded ? "Close" : "Open"} ${item.label}`}
                        onClick={() => setOpen(expanded ? null : item.label)}
                      >
                        <Icon name="chevron-down" size={16} className={`shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="role-side-head"
                      aria-expanded={expanded}
                      onClick={() => setOpen(expanded ? null : item.label)}
                      data-on={on || undefined}
                    >
                      {label}
                      <Icon name="chevron-down" size={16} className={`role-side-chevron shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </button>
                  )}
                  {expanded && (
                    <ul className="role-side-sub">
                      {item.children.map((child) => {
                        const childOn = child.path.includes("?") ? `${pathname}${search}` === child.path : onPath(pathname, child.path);
                        return (
                          <li key={child.path}>
                            <Link to={child.path} className="role-side-link" aria-current={childOn ? "page" : undefined}>
                              <span className="min-w-0 flex-1 truncate">{child.label}</span>
                              {child.count ? <span className="role-side-count">{child.count}</span> : null}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              ) : (
                <NavLink
                  to={item.path ?? item.children?.[0]?.path ?? "/"}
                  className="role-side-link"
                  aria-current={on ? "page" : undefined}
                  aria-label={collapsed ? item.label : undefined}
                >
                  {label}
                </NavLink>
              )}
            </div>
          );
        })}
      </nav>
      <div className="role-side-foot">
        <NavLink to={account.profilePath} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl" aria-label={collapsed ? `Profile, ${account.name}` : undefined}>
          <span className="role-side-avatar" aria-hidden="true">
            {account.initials}
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{account.name}</span>
              <span className="block truncate text-xs opacity-80">{account.detail}</span>
            </span>
          )}
        </NavLink>
        {!collapsed && (
          <button type="button" onClick={account.onSignOut} className="role-side-toggle" aria-label="Sign out">
            <Icon name="logout" size={19} />
          </button>
        )}
      </div>
    </aside>
  );
}

export default function RoleShell({
  role,
  title,
  context,
  headerRight,
  side,
  sideTop,
  dock,
  more,
  moreSearch,
  account,
  children,
  phoneHeader = true,
}: {
  role: Role;
  title: string;
  /** The one line under the title. */
  context?: ReactNode;
  /** The bell, and anything else at the right of the header. */
  headerRight?: ReactNode;
  side: SideItem[];
  /** Above the side menu's list: the supervisor's company chip, the coordinator's search. */
  sideTop?: ReactNode;
  dock: DockItem[];
  more: DockGroup[];
  moreSearch?: (close: () => void) => ReactNode;
  account: { initials: string; name: string; detail: string; profilePath: string; onSignOut: () => void };
  children: ReactNode;
  /** False on a page that draws its own phone header. */
  phoneHeader?: boolean;
}) {
  const wide = useMediaQuery("(min-width: 1280px)");
  const tablet = useMediaQuery("(min-width: 768px)");
  // A rail on tablets, whole on computers; the toggle changes it until the width class changes.
  const [collapsed, setCollapsed] = useState(!wide);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setCollapsed(!wide));
    return () => cancelAnimationFrame(frame);
  }, [wide]);

  return (
    <div className="flex min-h-[calc(100dvh-var(--inb-top-inset))] bg-(--role-surface) print:block print:bg-white">
      {tablet && <SideMenu items={side} top={sideTop} account={account} collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} canToggle />}
      <div className="flex min-w-0 flex-1 flex-col">
        {phoneHeader && (
          <div className="role-phone-only print:hidden">
            <PortalHeader role={role} pageTitle={title} context={context} right={headerRight} />
          </div>
        )}
        <header className="role-topbar print:hidden">
          <div className="min-w-0 flex-1">
            <h1 className="role-topbar-title truncate">{title}</h1>
            {context && <p className="role-topbar-context truncate">{context}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">{headerRight}</div>
        </header>
        <main className="app-canvas flex-1 print:bg-white">{children}</main>
      </div>
      <RoleDock items={dock} groups={more} account={account} search={moreSearch} scroller={null} />
    </div>
  );
}
