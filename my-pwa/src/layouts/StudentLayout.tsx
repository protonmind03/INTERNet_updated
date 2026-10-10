import { useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, NavLink, useLocation, useNavigate } from "react-router-dom";
import { PortalBrand, PortalHeader } from "../brand";
import Icon, { type IconName } from "../components/Icon";
import NotificationBell from "../components/NotificationBell";
import SavedDataNotice from "../components/SavedDataNotice";
import { ConfirmDialog, CountBadge } from "../components/ui";
import { getInitials } from "../lib/format";
import { useNavCounts, type NavCounts } from "../lib/navCounts";
import { useReportedHeight } from "../lib/layers";
import { signOut as endSession, useAccount } from "../lib/session";
import { useMediaQuery } from "../lib/useMediaQuery";

/*
|--------------------------------------------------------------------------
| STUDENT PORTAL LAYOUT
|--------------------------------------------------------------------------
|
| Students mostly use the system on a phone, to time in with a photo. So
| on small screens the four things they do daily sit in a bottom tab bar
| and everything else is one tap away under "More". On a desktop the same
| destinations become a sidebar.
|
*/

type NavItem = { label: string; path: string; icon: IconName };

const PRIMARY_NAV: NavItem[] = [
  { label: "Today", path: "/student/dashboard", icon: "home" },
  { label: "Attendance", path: "/daily-log", icon: "clock" },
  { label: "Tasks", path: "/task", icon: "tasks" },
  { label: "Documents", path: "/documents", icon: "document" },
];

const SECONDARY_NAV: NavItem[] = [
  { label: "Schedule", path: "/schedule", icon: "calendar" },
  { label: "Feedback", path: "/student/feedback", icon: "star" },
  { label: "Report a concern", path: "/report", icon: "flag" },
  { label: "Notifications", path: "/notifications", icon: "bell" },
];

const ACCOUNT_NAV: NavItem = { label: "Profile", path: "/profile", icon: "user" };

export default function StudentLayout({
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
  const location = useLocation();
  const student = useAccount("student");
  const counts = useNavCounts("student");
  const desktop = useMediaQuery("(min-width: 768px)");

  const [moreOpen, setMoreOpen] = useState(false);
  // Toasts and the push prompt sit above the tab bar, whatever its height.
  const tabBar = useReportedHeight<HTMLElement>("--inb-bottom-bar");
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
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  useEffect(() => {
    document.title = `${title} · INTERNet`;
  }, [title]);

  if (!student) return <Navigate to="/" replace />;

  const signOut = () => {
    endSession("student");
    navigate("/", { replace: true });
  };

  const moreActive = [...SECONDARY_NAV, ACCOUNT_NAV].some(
    (item) => item.path === location.pathname
  );

  return (
    <div className="flex h-[calc(100dvh-var(--inb-top-inset))] bg-slate-50 print:block print:h-auto print:bg-white">
      {/* SIDEBAR (desktop) */}
      <aside className="surface-brand hidden w-64 shrink-0 flex-col md:flex print:hidden">
        <div className="border-b border-white/10 px-5 py-5">
          <PortalBrand role="student" showTag />
        </div>

        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4 pt-4">
          <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-psu-300">
            Every day
          </p>
          <SidebarGroup items={PRIMARY_NAV} counts={counts} />
          <p className="mb-1.5 mt-6 px-3 text-xs font-semibold uppercase tracking-wider text-psu-300">
            More
          </p>
          <SidebarGroup items={SECONDARY_NAV} counts={counts} />
        </nav>

        <div className="border-t border-white/10 p-3">
          <NavLink
            to={ACCOUNT_NAV.path}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                isActive ? "bg-white/10" : "hover:bg-white/5"
              }`
            }
          >
            <Avatar name={student.name} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold text-white">
                {student.name}
              </span>
              <span className="block truncate text-xs text-psu-200">
                {student.student_id}
              </span>
            </span>
          </NavLink>
          <button
            type="button"
            onClick={() => setConfirmSignOut(true)}
            className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-psu-100 transition-colors hover:bg-white/5 hover:text-white"
          >
            <Icon name="logout" />
            Sign out
          </button>
        </div>
      </aside>

      {/* MAIN COLUMN */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 print:hidden">
          <PortalHeader
            role="student"
            variant={desktop ? "desktop" : "mobile"}
            pageTitle={title}
            context={
              desktop
                ? [student.program, student.company].filter(Boolean).join(" · ") ||
                  "Pangasinan State University"
                : student.company || undefined
            }
            right={
              <>
                <NotificationBell
                  role="student"
                  viewAllPath="/notifications"
                  buttonClassName={`relative flex h-11 w-11 items-center justify-center rounded-lg ${
                    desktop ? "text-slate-600 hover:bg-slate-100" : "text-white hover:bg-white/10"
                  }`}
                />
                {!desktop && (
                  <div className="relative" ref={menuRef}>
                    <button
                      type="button"
                      aria-label="Account menu"
                      aria-expanded={menuOpen}
                      onClick={() => setMenuOpen((open) => !open)}
                      className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10"
                    >
                      <Avatar name={student.name} />
                    </button>
                    {menuOpen && (
                      <div className="absolute right-0 top-full z-40 mt-2 w-60 origin-top-right animate-pop-in overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                        <div className="border-b border-slate-100 px-4 py-3">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {student.name}
                          </p>
                          <p className="truncate text-xs text-slate-500">{student.email}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            navigate("/profile");
                          }}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <Icon name="user" className="text-slate-400" />
                          Profile
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
                )}
              </>
            }
          />
        </div>

        <main className="app-canvas flex-1 overflow-y-auto print:overflow-visible">
          <div className="mx-auto w-full max-w-6xl animate-page-in px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8 print:max-w-none print:p-0">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3 md:mb-6">
              <div className="min-w-0">
                <h1 className="hidden text-2xl font-bold tracking-tight text-slate-900 md:block">
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-sm text-slate-500 md:mt-1">{subtitle}</p>
                )}
              </div>
              {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
            </div>
            <SavedDataNotice />
            {children}
          </div>
        </main>

        {/* BOTTOM TAB BAR (phones) */}
        <nav
          ref={tabBar}
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-(--z-tabbar) grid grid-cols-5 border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_18px_-10px_rgb(15_30_110/0.22)] backdrop-blur md:hidden print:hidden"
        >
          {PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${
                  isActive ? "text-psu-700" : "text-slate-500"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`relative flex h-7 w-14 items-center justify-center rounded-full transition-colors duration-200 ${
                      isActive ? "bg-linear-to-b from-psu-100 to-psu-200/70" : ""
                    }`}
                  >
                    <Icon name={item.icon} size={20} />
                    <CountBadge
                      count={counts[item.path]}
                      className="absolute -top-1 right-1.5 ring-2 ring-white"
                    />
                  </span>
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
          <button
            type="button"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(true)}
            className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${
              moreActive ? "text-psu-700" : "text-slate-500"
            }`}
          >
            <span
              className={`flex h-7 w-14 items-center justify-center rounded-full ${
                moreActive ? "bg-linear-to-b from-psu-100 to-psu-200/70" : ""
              }`}
            >
              <Icon name="more" size={20} />
            </span>
            More
          </button>
        </nav>
      </div>

      {/* "MORE" SHEET (phones) */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-(--z-drawer) flex animate-fade-in items-end bg-psu-950/50 md:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="More"
            className="w-full animate-sheet-in rounded-t-2xl bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-slate-300" />
            <div className="px-2 pb-1 pt-3">
              {[...SECONDARY_NAV, ACCOUNT_NAV].map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3.5 rounded-xl px-3 py-2.5 text-[15px] font-medium ${
                      isActive ? "bg-psu-50 text-psu-800" : "text-slate-700"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          isActive ? "bg-psu-100 text-psu-700" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        <Icon name={item.icon} size={19} />
                      </span>
                      <span className="flex-1">{item.label}</span>
                      <CountBadge count={counts[item.path]} />
                      <Icon name="chevron-right" size={16} className="text-slate-300" />
                    </>
                  )}
                </NavLink>
              ))}
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  setConfirmSignOut(true);
                }}
                className="mt-1 flex w-full items-center gap-3.5 rounded-xl border-t border-slate-100 px-4 py-3.5 text-left text-[15px] font-medium text-red-600"
              >
                <Icon name="logout" size={20} />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

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

function SidebarGroup({ items, counts }: { items: NavItem[]; counts: NavCounts }) {
  return (
    <div className="space-y-0.5">
      {items.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            `relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-linear-to-r from-white/15 to-white/5 text-white ring-1 ring-inset ring-white/10"
                : "text-psu-100 hover:bg-white/5 hover:text-white"
            }`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-gold-400" />
              )}
              <Icon name={item.icon} className={isActive ? "text-gold-300" : ""} />
              <span className="flex-1">{item.label}</span>
              <CountBadge count={counts[item.path]} tone="dark" />
            </>
          )}
        </NavLink>
      ))}
    </div>
  );
}

function Avatar({ name, tone = "dark" }: { name: string; tone?: "dark" | "light" }) {
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
        tone === "dark" ? "bg-gold-400 text-psu-950" : "bg-psu-700 text-white"
      }`}
    >
      {getInitials(name, "ST")}
    </span>
  );
}
