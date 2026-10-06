import { useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, NavLink, useLocation, useNavigate } from "react-router-dom";
import { BrandIcon, BrandLoader, PortalBrand, ROLE_THEMES } from "../brand";
import Icon, { type IconName } from "../components/Icon";
import NotificationBell from "../components/NotificationBell";
import { ConfirmDialog, CountBadge } from "../components/ui";
import { API_URL, withCoordinatorAuth } from "../lib/api";
import { getInitials } from "../lib/format";
import { useNavCounts } from "../lib/navCounts";
import type { NotificationItem } from "../lib/useNotifications";
import { signOut as endSession, useAccount } from "../lib/session";

/*
|--------------------------------------------------------------------------
| COORDINATOR PORTAL LAYOUT
|--------------------------------------------------------------------------
|
| The coordinator runs the whole programme from a desk, moving between
| many records. So this portal is a console: a light sidebar that groups
| every area, and a search box that jumps straight to a student,
| supervisor or complaint from anywhere (Ctrl K).
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
      { label: "Supervisors", path: "/coordinator/supervisors", icon: "briefcase" },
    ],
  },
  {
    label: "Programme",
    items: [
      { label: "Requirements", path: "/coordinator/requirements", icon: "clipboard" },
      { label: "Documents", path: "/coordinator/documents", icon: "document" },
      { label: "Evaluations", path: "/coordinator/evaluations", icon: "star" },
      { label: "Complaints", path: "/coordinator/complaints", icon: "flag" },
      { label: "Announcements", path: "/coordinator/announcements", icon: "megaphone" },
    ],
  },
];

/** The page a coordinator notification is about, inferred from its title. */
function notificationPath(item: NotificationItem): string {
  const title = item.title.toLowerCase();
  if (title.includes("complaint")) return "/coordinator/complaints";
  if (title.includes("attendance")) return "/coordinator/monitoring";
  if (title.includes("feedback") || title.includes("evaluation")) {
    return "/coordinator/evaluations";
  }
  return "";
}

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
  children,
}: {
  title: string;
  subtitle?: string;
  /** Buttons shown beside the page title. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const coordinator = useAccount("coordinator");
  const counts = useNavCounts("coordinator");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // With this many pages, the title also says which area of the console it
  // belongs to, so the coordinator always knows where they are.
  const area =
    NAV_GROUPS.find((group) =>
      group.items.some((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))
    )?.label ?? (pathname.startsWith("/coordinator/profile") ? "Account" : "");
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  useEffect(() => {
    document.title = `${title} · INTERNet`;
  }, [title]);

  if (!coordinator) return <Navigate to="/" replace />;

  const signOut = () => {
    endSession("coordinator");
    navigate("/", { replace: true });
  };

  const sidebar = (
    <>
      <div className="border-b border-slate-200/70 px-5 py-5">
        <PortalBrand role="coordinator" />
      </div>
      <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 pt-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 flex items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {group.label}
              <span aria-hidden="true" className="h-px flex-1 bg-slate-200/80" />
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setDrawerOpen(false)}
                  className={({ isActive }) =>
                    `relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-linear-to-r from-psu-100 to-psu-50 text-psu-900 ring-1 ring-inset ring-psu-600/10"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-psu-600" />
                      )}
                      <Icon
                        name={item.icon}
                        className={isActive ? "text-psu-700" : "text-slate-400"}
                      />
                      <span className="flex-1">{item.label}</span>
                      <CountBadge count={counts[item.path]} />
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-3">
        <NavLink
          to="/coordinator/profile"
          onClick={() => setDrawerOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2.5 ${
              isActive ? "bg-psu-50" : "hover:bg-slate-100"
            }`
          }
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-psu-600 to-psu-800 text-xs font-bold text-white">
            {getInitials(coordinator.name, "OC")}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold text-slate-900">
              {coordinator.name}
            </span>
            <span className="block truncate text-xs text-slate-500">
              {coordinator.department || "OJT Coordinator"}
            </span>
          </span>
        </NavLink>
        <button
          type="button"
          onClick={() => {
            setDrawerOpen(false);
            setConfirmSignOut(true);
          }}
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          <Icon name="logout" className="text-slate-400" />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-dvh bg-slate-50 print:block print:h-auto print:bg-white">
      <aside className="surface-console hidden w-64 shrink-0 flex-col border-r border-slate-200 lg:flex print:hidden">
        {sidebar}
      </aside>

      {/* The same sidebar as a drawer on smaller screens. */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden print:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-psu-950/50"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="surface-console relative flex w-72 max-w-[85vw] animate-drawer-in flex-col shadow-2xl">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-3 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            >
              <Icon name="close" />
            </button>
            {sidebar}
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
            <BrandIcon size={38} tile={ROLE_THEMES.coordinator.colors.surfaceRaised} title="INTERNet" />
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
          <div className="ml-auto">
            <NotificationBell
              role="coordinator"
              resolvePath={notificationPath}
              buttonClassName="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            />
          </div>
        </header>

        <main className="app-canvas flex-1 overflow-y-auto print:overflow-visible">
          <div className="mx-auto w-full max-w-7xl animate-page-in px-4 pb-12 pt-6 md:px-8 md:pt-8 print:max-w-none print:p-0">
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
            {children}
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
          aria-label="Search students, supervisors and complaints"
          aria-expanded={showPanel}
          aria-controls="coordinator-search-results"
          placeholder="Search students, supervisors, complaints"
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
                <span className="shrink-0 text-xs capitalize text-slate-400">
                  {result.type}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
