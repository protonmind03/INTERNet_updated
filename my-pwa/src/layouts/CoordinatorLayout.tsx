import { useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, NavLink, useLocation, useNavigate } from "react-router-dom";
import { BrandIcon, BrandLoader, LOGO_SIZES, PortalBrand, ROLE_THEMES, SIDEBAR } from "../brand";
import { useRoleTheme } from "../brand/useRoleTheme";
import Icon, { type IconName } from "../components/Icon";
import ComposeMessage from "../components/ComposeMessage";
import MessageThreadHost from "../components/MessageThreadHost";
import NotificationBell from "../components/NotificationBell";
import Tooltip from "../components/Tooltip";
import { Button, ConfirmDialog, CountBadge } from "../components/ui";
import { API_URL, withCoordinatorAuth } from "../lib/api";
import { getInitials } from "../lib/format";
import { useNavCounts } from "../lib/navCounts";
import { signOut as endSession, useAccount } from "../lib/session";
import { useScrollPane } from "../lib/useScrollPane";
import { HUBS, useHub } from "../pages/coordinator/hubConfig";
import HubNav from "../pages/coordinator/HubNav";

/*
|--------------------------------------------------------------------------
| COORDINATOR PORTAL LAYOUT
|--------------------------------------------------------------------------
|
| The coordinator runs the whole programme from a desk, moving between
| many records. So this portal is a console: a sidebar in the student
| portal's style (brand/tokens.ts, SIDEBAR) that groups every area, and a search box that jumps straight to a student,
| supervisor or complaint from anywhere (Ctrl K).
|
| The side navigation holds the daily jobs (roadmap 5.1). Pages about one
| subject are tabs of one hub (pages/coordinator/hubConfig.ts); concerns,
| evaluations and appeals are the Resolution Center, an icon left of the
| bell; announcements are written from the bell; the coordinators, the
| audit log and what is switched on are in Profile settings, from the
| avatar.
|
*/

type NavItem = { label: string; path: string; icon: IconName };

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", path: "/coordinator/dashboard", icon: "grid" },
      { label: "Monitoring", path: "/coordinator/monitoring", icon: "activity" },
      { label: "Analytics", path: "/coordinator/analytics", icon: "chart" },
    ],
  },
  {
    label: "People",
    items: [
      { label: "Students", path: "/coordinator/students", icon: "users" },
      { label: "Companies", path: "/coordinator/companies", icon: "building" },
    ],
  },
  {
    label: "Programme",
    items: [
      { label: "Programs", path: "/coordinator/programs", icon: "building" },
      { label: "Holidays", path: "/coordinator/holidays", icon: "calendar" },
      { label: "Documents", path: "/coordinator/documents", icon: "document" },
    ],
  },
];

const RESOLUTION_PATH = HUBS.resolution.path;


type SearchResult = {
  type: "student" | "supervisor" | "complaint";
  id: string;
  title: string;
  detail: string;
  href: string;
};

export default function CoordinatorLayout({
  title,
  subtitle,
  actions,
  hideHeading = false,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Buttons shown beside the page title. */
  actions?: ReactNode;
  /**
   * True for a page that draws its own heading (the student record's folder).
   * The title still names the browser tab; it is just not printed twice.
   */
  hideHeading?: boolean;
  children: ReactNode;
}) {
  useRoleTheme("coordinator");
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const coordinator = useAccount("coordinator");
  const counts = useNavCounts("coordinator");
  const hub = useHub();
  // One scroll pane each: the sidebar on a wide screen, and the same list in the phone drawer.
  const deskPane = useScrollPane<HTMLElement>();
  const drawerPane = useScrollPane<HTMLElement>();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // With this many pages, the title also says which area of the console it
  // belongs to, so the coordinator always knows where they are.
  const area =
    NAV_GROUPS.find((group) =>
      group.items.some((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))
    )?.label ?? (hub ? HUBS[hub.hub].title : pathname.startsWith("/coordinator/profile") ? "Account" : "");
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [writing, setWriting] = useState(false);
  // A student's record draws its own heading; its Message action is added here,
  // above it, so the record page itself is not changed.
  const recordOf = hideHeading ? /^\/coordinator\/students\/([^/]+)\/?$/.exec(pathname)?.[1] : undefined;
  const recordStudentId = recordOf ? decodeURIComponent(recordOf) : undefined;

  useEffect(() => {
    document.title = `${title} · INTERNet`;
  }, [title]);

  if (!coordinator) return <Navigate to="/" replace />;

  const signOut = () => {
    endSession("coordinator");
    navigate("/", { replace: true });
  };

  const sidebar = (pane: (element: HTMLElement | null) => void) => (
    <>
      <div className={SIDEBAR.brandBlock}>
        <PortalBrand role="coordinator" onDark />
      </div>
      {/* Only the list scrolls; the brand block and the account footer stay put. */}
      <nav ref={pane} aria-label="Main" className={`inb-scroll-pane flex-1 ${SIDEBAR.nav}`}>
        {NAV_GROUPS.map((group, index) => (
          <div key={group.label}>
            <p className={`${SIDEBAR.groupLabel} ${index > 0 ? SIDEBAR.groupGap : ""}`}>{group.label}</p>
            <div className={SIDEBAR.groupItems}>
              {group.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setDrawerOpen(false)}
                  className={({ isActive }) => `${SIDEBAR.item} ${isActive ? SIDEBAR.itemActive : SIDEBAR.itemIdle}`}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className={SIDEBAR.activeBar} />}
                      <Icon name={item.icon} className={isActive ? SIDEBAR.activeIcon : ""} />
                      <span className="flex-1">{item.label}</span>
                      <CountBadge count={counts[item.path]} tone={SIDEBAR.badgeTone} />
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className={SIDEBAR.footer}>
        <NavLink
          to="/coordinator/profile"
          onClick={() => setDrawerOpen(false)}
          className={({ isActive }) => `${SIDEBAR.accountLink} ${isActive ? SIDEBAR.accountActive : SIDEBAR.accountIdle}`}
        >
          {/* The coordinator's own mark: their indigo, not the student's gold. */}
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-psu-500 to-psu-700 text-xs font-bold text-white ring-1 ring-white/20">
            {getInitials(coordinator.name, "OC")}
          </span>
          <span className="min-w-0 leading-tight">
            <span className={SIDEBAR.accountName}>{coordinator.name}</span>
            <span className={SIDEBAR.accountDetail}>{coordinator.department || "OJT Coordinator"}</span>
          </span>
        </NavLink>
        <button
          type="button"
          onClick={() => {
            setDrawerOpen(false);
            setConfirmSignOut(true);
          }}
          className={SIDEBAR.signOut}
        >
          <Icon name="logout" />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-[calc(100dvh-var(--inb-top-inset))] bg-slate-50 print:block print:h-auto print:bg-white">
      <aside className={`${SIDEBAR.surface} hidden w-64 shrink-0 flex-col lg:flex print:hidden`}>
        {sidebar(deskPane)}
      </aside>

      {/* The same sidebar as a drawer on smaller screens. */}
      {drawerOpen && (
        <div className="fixed inset-0 z-(--z-drawer) flex lg:hidden print:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-psu-950/50"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className={`${SIDEBAR.surface} relative flex w-72 max-w-[85vw] animate-drawer-in flex-col shadow-2xl`}>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-psu-100 hover:bg-white/10 hover:text-white"
            >
              <Icon name="close" />
            </button>
            {sidebar(drawerPane)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-10 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200/80 bg-white px-4 shadow-card md:px-8 print:hidden">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
            className="-ml-1 flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
          >
            <Icon name="menu" size={20} />
          </button>
          <span className="shrink-0 lg:hidden">
            <BrandIcon size={LOGO_SIZES.bar.icon} tile={ROLE_THEMES.coordinator.colors.surfaceRaised} title="INTERNet" />
          </span>
          <div className="hidden min-w-0 shrink items-center gap-3 lg:flex">
            <span
              className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{
                background: ROLE_THEMES.coordinator.colors.tagBg,
                color: ROLE_THEMES.coordinator.colors.tagText,
              }}
            >
              {ROLE_THEMES.coordinator.tag}
            </span>
            <p className="hidden truncate text-sm text-slate-600 xl:block">
              {coordinator.department || "Pangasinan State University · Lingayen Campus"}
            </p>
          </div>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1">
            <ResolutionButton count={counts[RESOLUTION_PATH] ?? 0} />
            <NotificationBell
              role="coordinator"
              viewAllPath="/coordinator/notifications"
              announcementsFor="coordinator"
              buttonClassName="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            />
          </div>
        </header>

        <main className="app-canvas flex-1 overflow-y-auto print:overflow-visible">
          <div className="mx-auto w-full max-w-7xl animate-page-in px-4 pb-12 pt-6 md:px-8 md:pt-8 print:max-w-none print:p-0">
            {!hideHeading && (
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                {area && (
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-psu-600 print:hidden">
                    {area}
                  </p>
                )}
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
                {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
              </div>
              {actions && (
                <div className="flex flex-wrap gap-2 print:hidden">{actions}</div>
              )}
            </div>
            )}
            {hub && HUBS[hub.hub].kind === "tabs" && <HubNav hub={hub.hub} tab={hub.tab} />}
            {recordStudentId && (
              <div className="mb-3 flex justify-end print:hidden">
                <Button variant="secondary" icon="mail" onClick={() => setWriting(true)}>
                  Message {title.split(" ")[0]}
                </Button>
              </div>
            )}
            {hub && HUBS[hub.hub].kind === "sections" ? (
              // Profile settings: its sections down the left, the chosen one beside them.
              <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-8">
                <HubNav hub={hub.hub} tab={hub.tab} />
                <div className="min-w-0">{children}</div>
              </div>
            ) : (
              children
            )}
            <MessageThreadHost role="coordinator" />
            {writing && recordStudentId && (
              <ComposeMessage
                role="coordinator"
                to={{ role: "student", id: recordStudentId }}
                subject="About your OJT"
                context={{ type: "student", id: recordStudentId, label: `Student record, ${title}` }}
                onClose={() => setWriting(false)}
              />
            )}
          </div>
        </main>
      </div>

      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out?"
        message="You will need your password to sign in again."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        tone="danger"
        onConfirm={signOut}
        onCancel={() => setConfirmSignOut(false)}
      />
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| GLOBAL SEARCH
|--------------------------------------------------------------------------
*/

const RESULT_ICONS: Record<SearchResult["type"], IconName> = {
  student: "users",
  supervisor: "briefcase",
  complaint: "flag",
};

function GlobalSearch() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
      }
    };
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, []);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `${API_URL}/api/coordinator/search?q=${encodeURIComponent(text)}`,
          withCoordinatorAuth({ signal: controller.signal })
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Search failed.");
        setResults(data.results || []);
        setHighlighted(0);
      } catch (searchError) {
        if (searchError instanceof DOMException && searchError.name === "AbortError") return;
        setResults([]);
        setError("Search is unavailable right now.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  const go = (result: SearchResult) => {
    navigate(result.href);
    setQuery("");
    setResults([]);
    setOpen(false);
    inputRef.current?.blur();
  };

  const showPanel = open && query.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1 md:max-w-xl">
      <div className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 focus-within:border-psu-500 focus-within:ring-[3px] focus-within:ring-psu-500/20">
        <Icon name="search" size={16} className="shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          type="search"
          maxLength={100}
          value={query}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            setOpen(true);
            if (value.trim().length < 2) {
              setResults([]);
              setError("");
              setLoading(false);
            }
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              setHighlighted((index) => Math.min(index + 1, results.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlighted((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter" && results[highlighted]) {
              go(results[highlighted]);
            }
          }}
          role="combobox"
          aria-label="Search students, supervisors and concerns"
          aria-expanded={showPanel}
          aria-controls="coordinator-search-results"
          placeholder="Search students, supervisors, concerns"
          className="h-full w-full min-w-0 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
        />
        <kbd className="hidden shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs font-medium text-slate-500 md:block">
          Ctrl K
        </kbd>
      </div>

      {showPanel && (
        <div
          id="coordinator-search-results"
          role="listbox"
          aria-label="Search results"
          className="absolute inset-x-0 top-full z-40 mt-2 max-h-96 origin-top animate-pop-in overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
        >
          {loading && (
            <div className="px-4 py-3">
              <BrandLoader variant="inline" role="coordinator" process="search" />
            </div>
          )}
          {!loading && error && (
            <p role="alert" className="px-4 py-3 text-sm text-red-600">
              {error}
            </p>
          )}
          {!loading && !error && results.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-500">
              Nothing matches "{query.trim()}".
            </p>
          )}
          {!loading &&
            !error &&
            results.map((result, index) => (
              <button
                key={`${result.type}-${result.id}`}
                type="button"
                role="option"
                aria-selected={index === highlighted}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => go(result)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${
                  index === highlighted ? "bg-psu-50" : ""
                }`}
              >
                <Icon name={RESULT_ICONS[result.type]} className="shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {result.title}
                  </span>
                  <span className="block truncate text-xs text-slate-500">{result.detail}</span>
                </span>
                <span className="shrink-0 text-xs capitalize text-slate-500">
                  {result.type}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

/**
 * The Resolution Center as an icon left of the bell: concerns, evaluations
 * and appeals. Its badge counts open concerns and appeals older than the
 * dashboard's rule for concerns (7 days), so it asks for attention only
 * when something has waited too long.
 */
function ResolutionButton({ count }: { count: number }) {
  const label = HUBS.resolution.title;
  const shown = count > 99 ? "99+" : String(count);
  return (
    <Tooltip label={label} side="left">
      <NavLink
        to={RESOLUTION_PATH}
        aria-label={count > 0 ? `${label}, ${count === 1 ? "1 item" : `${count} items`} waiting more than a week` : label}
        className={({ isActive }) =>
          `relative flex h-11 w-11 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-psu-500 ${
            isActive ? "bg-psu-50 text-psu-800" : "text-slate-600 hover:bg-slate-100"
          }`
        }
      >
        <Icon name="flag" />
        {count > 0 && (
          <span
            aria-hidden="true"
            className="tabular absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold leading-none text-white ring-2 ring-white"
          >
            {shown}
          </span>
        )}
      </NavLink>
    </Tooltip>
  );
}
