import { useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, NavLink, useNavigate } from "react-router-dom";
import { BrandMark } from "../components/Brand";
import Icon from "../components/Icon";
import NotificationBell from "../components/NotificationBell";
import { ConfirmDialog, CountBadge } from "../components/ui";
import { getInitials } from "../lib/format";
import { useNavCounts } from "../lib/navCounts";
import { clearSession, useAccount } from "../lib/session";

/*
|--------------------------------------------------------------------------
| SUPERVISOR PORTAL LAYOUT
|--------------------------------------------------------------------------
|
| Supervisors are company staff who open the system for a few minutes at a
| time, usually at a desk, to clear what is waiting on them. So the portal
| uses a single top navigation bar that keeps the full width for lists and
| review panes, with "Review" as the first stop.
|
*/

const NAV = [
  { label: "Review", path: "/supervisor/dashboard" },
  { label: "Interns", path: "/supervisor/interns" },
  { label: "Attendance", path: "/supervisor/attendance" },
  { label: "Tasks", path: "/supervisor/tasks" },
  { label: "Documents", path: "/supervisor/documents" },
  { label: "Evaluations", path: "/supervisor/evaluation" },
  { label: "Incidents", path: "/supervisor/complaints" },
];

export default function SupervisorLayout({
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
  const supervisor = useAccount("supervisor");
  const counts = useNavCounts("supervisor");
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    document.title = `${title} · INTERNet`;
  }, [title]);

  if (!supervisor) return <Navigate to="/" replace />;

  const signOut = () => {
    clearSession("supervisor");
    navigate("/", { replace: true });
  };

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 print:bg-white">
      <header className="sticky top-0 z-30 bg-psu-950 text-white print:hidden">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-6 px-4 md:px-8">
          <NavLink to="/supervisor/dashboard" className="flex shrink-0 items-center gap-2.5">
            <BrandMark size={32} />
            <span className="leading-tight">
              <span className="block text-sm font-bold tracking-tight">INTERNet</span>
              <span className="block text-xs text-psu-200">Supervisor</span>
            </span>
          </NavLink>

          <nav aria-label="Main" className="hidden h-full flex-1 items-stretch gap-1 lg:flex">
            {NAV.map((item) => (
              <TopLink key={item.path} {...item} count={counts[item.path]} />
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <NotificationBell
              role="supervisor"
              viewAllPath="/supervisor/notifications"
              buttonClassName="relative flex h-10 w-10 items-center justify-center rounded-lg text-psu-100 hover:bg-white/10 hover:text-white"
            />
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                aria-label="Account menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-white/10"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-400 text-xs font-bold text-psu-950">
                  {getInitials(supervisor.name, "SV")}
                </span>
                <span className="hidden max-w-40 truncate text-sm font-medium sm:block">
                  {supervisor.name}
                </span>
                <Icon name="chevron-down" size={15} className="text-psu-200" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-40 mt-2 w-64 origin-top-right animate-pop-in overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-800 shadow-xl">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {supervisor.name}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {[supervisor.company, supervisor.department].filter(Boolean).join(" · ") ||
                        supervisor.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      navigate("/supervisor/profile");
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <Icon name="user" className="text-slate-400" />
                    Profile and password
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmSignOut(true);
                    }}
                    className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    <Icon name="logout" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Below large screens the same links sit in a scrollable second row. */}
        <nav
          aria-label="Main"
          className="flex h-11 items-stretch gap-1 overflow-x-auto border-t border-white/10 px-2 lg:hidden"
        >
          {NAV.map((item) => (
            <TopLink key={item.path} {...item} count={counts[item.path]} />
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 animate-page-in px-4 pb-12 pt-6 md:px-8 md:pt-8 print:max-w-none print:p-0">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
        {children}
      </main>

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

function TopLink({ label, path, count }: { label: string; path: string; count?: number }) {
  return (
    <NavLink
      to={path}
      className={({ isActive }) =>
        `relative flex shrink-0 items-center px-3 text-sm font-medium transition-colors ${
          isActive ? "text-white" : "text-psu-200 hover:text-white"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {label}
          <CountBadge count={count} tone="dark" className="ml-1.5" />
          {isActive && (
            <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t bg-gold-400" />
          )}
        </>
      )}
    </NavLink>
  );
}
