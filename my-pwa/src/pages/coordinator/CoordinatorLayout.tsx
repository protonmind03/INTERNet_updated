import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { API_URL, withCoordinatorAuth } from "../../lib/api";
import NotificationBell from "../../components/NotificationBell";

type Coordinator = {
  coordinator_id: string;
  email: string;
  name: string;
  department: string | null;
};

type SearchResult = {
  type: "student" | "supervisor" | "complaint";
  id: string;
  title: string;
  detail: string;
  href: string;
};

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", path: "/coordinator/dashboard", icon: "grid" },
      { label: "Monitoring", path: "/coordinator/monitoring", icon: "activity" },
      { label: "Analytics", path: "/coordinator/analytics", icon: "bar-chart" },
    ],
  },
  {
    label: "Management",
    items: [
      { label: "Students", path: "/coordinator/students", icon: "user" },
      { label: "Supervisors", path: "/coordinator/supervisors", icon: "briefcase" },
      { label: "OJT Requirements", path: "/coordinator/requirements", icon: "clipboard" },
    ],
  },
  {
    label: "Oversight",
    items: [
      { label: "Documents", path: "/coordinator/documents", icon: "clipboard" },
      { label: "Complaints", path: "/coordinator/complaints", icon: "flag" },
      { label: "Evaluations", path: "/coordinator/evaluations", icon: "star" },
    ],
  },
];



function NavIcon({ name }: { name: string }) {
  const common = {
    xmlns: "http://www.w3.org/2000/svg",
    width: 17,
    height: 17,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
  };

  switch (name) {
    case "grid":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />
        </svg>
      );
    case "briefcase":
      return (
        <svg {...common}>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      );
    case "activity":
      return (
        <svg {...common}>
          <path d="M3 12h4l2 8 4-16 2 8h6" />
        </svg>
      );
    case "flag":
      return (
        <svg {...common}>
          <path d="M5 21V4" />
          <path d="M5 4h13l-3 4 3 4H5" />
        </svg>
      );
    case "star":
      return (
        <svg {...common}>
          <path d="M12 3l2.7 5.8 6.3.6-4.8 4.2 1.4 6.2L12 16.9 6.4 19.8l1.4-6.2L3 9.4l6.3-.6L12 3Z" />
        </svg>
      );
    case "clipboard":
      return (
        <svg {...common}>
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <path d="M9 4V3h6v1M9 11h6M9 15h4" />
        </svg>
      );
    case "bar-chart":
      return (
        <svg {...common}>
          <path d="M4 20V10M12 20V4M20 20v-7" />
        </svg>
      );
    default:
      return null;
  }
}

export default function CoordinatorLayout({
  title,
  subtitle,
  breadcrumb,
  children,
}: {
  title: string;
  subtitle?: string;
  breadcrumb?: string[];
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const [coordinator, setCoordinator] = useState<Coordinator | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("coordinator");
    const token = localStorage.getItem("coordinator_token");

    if (!saved || !token) {
      navigate("/");
      return;
    }

    try {
      setCoordinator(JSON.parse(saved));
    } catch {
      localStorage.removeItem("coordinator");
      localStorage.removeItem("coordinator_id");
      localStorage.removeItem("coordinator_token");
      navigate("/");
    }
  }, [navigate]);

  useEffect(() => {
    const syncProfile = (event: Event) => {
      const updated = (event as CustomEvent<Coordinator>).detail;
      if (updated) setCoordinator(updated);
    };

    window.addEventListener("coordinator-profile-updated", syncProfile);
    return () =>
      window.removeEventListener("coordinator-profile-updated", syncProfile);
  }, []);

  useEffect(() => {
    const handleSearchKeys = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShowSearchResults(true);
        searchInputRef.current?.focus();
      } else if (event.key === "Escape") {
        setShowSearchResults(false);
      }
    };

    document.addEventListener("keydown", handleSearchKeys);
    return () => document.removeEventListener("keydown", handleSearchKeys);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError("");
      try {
        const response = await fetch(
          `${API_URL}/api/coordinator/search?q=${encodeURIComponent(query)}`,
          withCoordinatorAuth({ signal: controller.signal })
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || "Search failed.");
        }
        setSearchResults(data.results);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setSearchResults([]);
        setSearchError(
          error instanceof Error ? error.message : "Unable to search records."
        );
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [searchQuery]);

  const openSearchResult = (result: SearchResult) => {
    navigate(result.href);
    setSearchQuery("");
    setSearchResults([]);
    setShowSearchResults(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("coordinator");
    localStorage.removeItem("coordinator_id");
    localStorage.removeItem("coordinator_token");
    navigate("/");
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();

  return (
    <div className="flex h-screen bg-slate-50 print:block print:h-auto print:bg-white">
      {/* SIDEBAR */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex print:hidden">
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 font-bold text-white">
            IN
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight text-slate-900">
              INTERNet
            </p>
            <p className="text-[11px] leading-tight text-slate-400">
              Coordinator Portal
            </p>
          </div>
        </div>

        <nav className="mt-3 flex-1 space-y-5 overflow-y-auto px-3 pb-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = location.pathname === item.path;
                  return (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => navigate(item.path)}
                      className={`flex w-full items-center gap-2.5 rounded-lg border-l-[3px] px-2.5 py-2 text-left text-sm font-medium transition ${
                        active
                          ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                          : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                      }`}
                    >
                      <NavIcon name={item.icon} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* QUICK ACTION */}
        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={() => navigate("/coordinator/students")}
            className="flex w-full items-center gap-3 rounded-xl bg-indigo-600 px-3.5 py-3 text-left text-white transition hover:bg-indigo-500"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-lg leading-none">
              +
            </div>
            <div>
              <p className="text-xs font-semibold leading-tight">
                Register Student
              </p>
              <p className="text-[10px] leading-tight text-indigo-100">
                Quick onboarding
              </p>
            </div>
          </button>
        </div>

        <div className="border-t border-slate-100 p-3">
          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5M21 12H9" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 md:px-6 print:hidden">
          <div
            ref={searchRef}
            className="relative hidden min-w-0 flex-1 sm:block"
          >
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="shrink-0 text-slate-400"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={searchInputRef}
                type="search"
                maxLength={100}
                value={searchQuery}
                onChange={(event) => {
                  const value = event.target.value;
                  setSearchQuery(value);
                  setShowSearchResults(true);
                  if (value.trim().length < 2) {
                    setSearchResults([]);
                    setSearchError("");
                    setSearchLoading(false);
                  }
                }}
                onFocus={() => setShowSearchResults(true)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && searchResults[0]) {
                    openSearchResult(searchResults[0]);
                  }
                }}
                aria-label="Search students, supervisors, and complaints"
                aria-expanded={showSearchResults}
                aria-controls="coordinator-search-results"
                placeholder="Search students, supervisors, complaints..."
                className="w-full min-w-0 bg-transparent text-sm text-slate-600 placeholder:text-slate-400 focus:outline-none"
              />
              <span className="shrink-0 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                Ctrl K
              </span>
            </div>
            {showSearchResults && searchQuery.trim().length >= 2 && (
              <div
                id="coordinator-search-results"
                role="listbox"
                aria-label="Search results"
                className="absolute left-0 right-0 top-full z-40 mt-2 max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
              >
                {searchLoading && (
                  <p className="px-4 py-3 text-sm text-slate-500">
                    Searching records...
                  </p>
                )}
                {!searchLoading && searchError && (
                  <p role="alert" className="px-4 py-3 text-sm text-red-600">
                    {searchError}
                  </p>
                )}
                {!searchLoading &&
                  !searchError &&
                  searchResults.length === 0 && (
                    <p className="px-4 py-3 text-sm text-slate-500">
                      No matching records found.
                    </p>
                  )}
                {!searchLoading &&
                  !searchError &&
                  searchResults.map((result) => (
                    <button
                      key={`${result.type}-${result.id}`}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => openSearchResult(result)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-800">
                          {result.title}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {result.detail}
                        </span>
                      </span>
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-indigo-600">
                        {result.type}
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* NOTIFICATIONS */}
            <NotificationBell
              role="coordinator"
              buttonClassName="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
            />

            {/* PROFILE */}
            <button
              type="button"
              onClick={() => navigate("/coordinator/profile")}
              aria-label="Open coordinator profile"
              className="flex items-center gap-2 rounded-md bg-slate-100 px-2 py-1.5 text-left hover:bg-indigo-50"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
                {getInitials(coordinator?.name || "OC")}
              </div>
              <div className="hidden text-right leading-tight sm:block">
                <p className="text-xs font-semibold text-slate-800">
                  {coordinator?.name || "OJT Coordinator"}
                </p>
                <p className="text-[10px] text-slate-400">Coordinator</p>
              </div>
            </button>
          </div>
        </header>

        <div className="border-b border-slate-100 bg-white px-4 py-3.5 md:px-6">
          {breadcrumb && breadcrumb.length > 0 && (
            <div className="mb-1 flex items-center gap-1.5 text-xs text-slate-400">
              {breadcrumb.map((crumb, i) => (
                <span key={crumb} className="flex items-center gap-1.5">
                  {i > 0 && <span>/</span>}
                  <span
                    className={
                      i === breadcrumb.length - 1
                        ? "font-medium text-slate-500"
                        : ""
                    }
                  >
                    {crumb}
                  </span>
                </span>
              ))}
            </div>
          )}
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 print:overflow-visible print:p-0">{children}</main>
      </div>

      {/* LOGOUT MODAL */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="text-red-500"
              >
                <path d="M10.3 3.9 2.7 17a1.8 1.8 0 0 0 1.5 2.7h15.6a1.8 1.8 0 0 0 1.5-2.7L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                <path d="M12 9v4" />
                <path d="M12 16.5h.01" />
              </svg>
            </div>
            <div className="mt-4 text-center">
              <h2 className="text-lg font-semibold text-slate-900">
                Sign out?
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                Are you sure you want to sign out of your coordinator account?
              </p>
            </div>
            <div className="mt-6 flex gap-2.5">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                No, Stay
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex-1 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600"
              >
                Yes, Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
