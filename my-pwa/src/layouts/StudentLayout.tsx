import { useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, NavLink, useLocation, useNavigate } from "react-router-dom";
import { PortalHeader } from "../brand";
import { useRoleTheme } from "../brand/useRoleTheme";
import Onboarding from "../components/Onboarding";
import FolderShell, { type FolderTab } from "../components/folder/FolderShell";
import StudentDock from "../components/StudentDock";
import { useSpotlightParam } from "../lib/spotlight";
import Icon, { type IconName } from "../components/Icon";
import MessageThreadHost from "../components/MessageThreadHost";
import NotificationBell from "../components/NotificationBell";
import SavedDataNotice from "../components/SavedDataNotice";
import Tooltip from "../components/Tooltip";
import { ConfirmDialog, ProgressBar } from "../components/ui";
import { formatHours, getInitials } from "../lib/format";
import { useNavCounts } from "../lib/navCounts";
import { waitingSteps } from "../lib/offlineQueue";
import { signOut as endSession, useAccount } from "../lib/session";
import TimeInFab from "../pages/student/TimeInFab";
import TimeInProvider from "../pages/student/TimeInProvider";
import { PhotoRedoBanner } from "../pages/student/PhotoRedo";
import WaitingToSend from "../pages/student/WaitingToSend";
import { useWaitingCount } from "../lib/useWaitingCount";
import { useStudentProgress } from "../pages/student/useStudentProgress";

/*
|--------------------------------------------------------------------------
| STUDENT PORTAL LAYOUT
|--------------------------------------------------------------------------
|
| Roadmap 3.6: the student's portal is their folder, drawn like the record
| the coordinator keeps of them (components/folder/FolderShell.tsx). The
| label tab says whose it is: their name, program and company, and their
| verified hours toward the requirement. Its tabs are what they do: Today,
| Attendance, Tasks, Documents, Schedule and Weekly report. On a phone the
| tabs are one row that scrolls sideways under the header.
|
| The brand bar above it holds what is about the account rather than the
| day: the Resolution Center as an icon left of the bell (with a count of
| concerns that have a new reply), the bell (notifications and
| announcements) and the avatar, which opens Profile and Sign out. Pages
| that are not tabs (Profile, notifications, the Resolution Center) open
| inside the same folder with no tab lit.
|
| The next step of the day is the floating button on a phone and a button
| in the page header on a desktop (pages/student/TimeInFab.tsx keeps its
| own rules about where it shows).
|
*/

type NavItem = { label: string; path: string; icon: IconName };

// Iteration 21: Schedule moves up beside Attendance. On a phone the first four are
// the dock (components/StudentDock.tsx); the rest are under its More.
const FOLDER_TABS: NavItem[] = [
  { label: "Today", path: "/student/dashboard", icon: "home" },
  { label: "Attendance", path: "/daily-log", icon: "clock" },
  { label: "Schedule", path: "/schedule", icon: "calendar" },
  { label: "Tasks", path: "/task", icon: "tasks" },
  { label: "Documents", path: "/documents", icon: "document" },
  { label: "Weekly report", path: "/journal", icon: "note" },
];

const ACCOUNT_NAV: NavItem = { label: "Profile", path: "/profile", icon: "user" };

/** Concerns and evaluations. Reached from the header, not the folder. */
const RESOLUTION_NAV: NavItem = { label: "Resolution Center", path: "/student/resolution", icon: "flag" };

type LayoutProps = {
  title: string;
  subtitle?: string;
  /** Buttons shown beside the page title. */
  actions?: ReactNode;
  children: ReactNode;
};

/**
 * Every student page is drawn inside this. It also holds the shared
 * time-in actions (the day's attendance and its dialogs), so any page can
 * offer the next step.
 */
export default function StudentLayout(props: LayoutProps) {
  useRoleTheme("student");
  return (
    <TimeInProvider>
      {/* Iteration 23: the first open of the installed app. */}
      <Onboarding role="student" />
      <StudentChrome {...props} />
    </TimeInProvider>
  );
}

function StudentChrome({ title, subtitle, actions, children }: LayoutProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const student = useAccount("student");
  const counts = useNavCounts("student");
  const progress = useStudentProgress(student?.student_id);

  const [menuOpen, setMenuOpen] = useState(false);
  // Steps recorded offline still on this phone: a badge on the account button.
  const waitingCount = useWaitingCount();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  // Steps recorded offline and not sent yet. Signing out erases them, so
  // the question says how many there are.
  const [unsent, setUnsent] = useState(0);
  useEffect(() => {
    if (!confirmSignOut) return;
    let current = true;
    void waitingSteps().then((steps) => {
      if (current) setUnsent(steps.length);
    });
    return () => {
      current = false;
    };
  }, [confirmSignOut]);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // The page scrolls in <main>; the dock watches it to step aside.
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  // A notification opened this page with ?spot=: show what it is about (lib/spotlight.ts).
  useSpotlightParam();

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

  if (!student) return <Navigate to="/" replace />;

  const signOut = () => {
    endSession("student");
    navigate("/", { replace: true });
  };

  const tabs: FolderTab[] = FOLDER_TABS.map((item) => ({
    id: item.path,
    label: item.label,
    icon: item.icon,
    to: item.path,
    count: counts[item.path],
  }));
  const current = FOLDER_TABS.find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))?.path ?? null;
  const placement = [student.program, student.company].filter(Boolean).join(" · ");
  const required = progress?.required ?? 0;
  const percent = required > 0 ? Math.min(100, ((progress?.rendered ?? 0) / required) * 100) : 0;

  return (
    <div className="flex h-[calc(100dvh-var(--inb-top-inset))] flex-col bg-slate-50 print:block print:h-auto print:bg-white">
      <div className="shrink-0 print:hidden">
        <PortalHeader
          role="student"
          variant="mobile"
          right={
            <>
              <ResolutionButton count={counts[RESOLUTION_NAV.path] ?? 0} />
              <NotificationBell
                role="student"
                announcementsFor="student"
                buttonClassName="relative flex h-11 w-11 items-center justify-center rounded-lg text-white hover:bg-white/10"
              />
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((open) => !open)}
                  className="relative flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10"
                >
                  <Avatar name={student.name} />
                  <span className="sr-only">Account menu for {student.name}</span>
                  {waitingCount > 0 && (
                    <span
                      data-testid="waiting-badge"
                      className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-gold-400 px-1 text-[11px] font-bold leading-none text-psu-950 ring-2 ring-psu-800"
                    >
                      {waitingCount}
                      <span className="sr-only">{waitingCount === 1 ? " step" : " steps"} waiting to send</span>
                    </span>
                  )}
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full z-40 mt-2 w-60 origin-top-right animate-pop-in overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                    <div className="border-b border-slate-100 px-4 py-3">
                      <p className="truncate text-sm font-semibold text-slate-900">{student.name}</p>
                      <p className="truncate text-xs text-slate-500">{student.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        navigate(ACCOUNT_NAV.path);
                      }}
                      className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <Icon name={ACCOUNT_NAV.icon} className="text-slate-400" />
                      {ACCOUNT_NAV.label}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirmSignOut(true);
                      }}
                      className="flex min-h-11 w-full items-center gap-3 border-t border-slate-100 px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50"
                    >
                      <Icon name="logout" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          }
        />
      </div>

      <main ref={setScroller} className="app-canvas flex-1 overflow-y-auto print:overflow-visible">
        <div className="mx-auto w-full max-w-6xl animate-page-in px-2 pb-44 pt-3 sm:px-4 md:px-8 md:pb-10 md:pt-6 print:max-w-none print:p-0">
          <FolderShell
            phoneTabs={false}
            tabsLabel="Main"
            tabs={tabs}
            current={current}
            leading={
              <span aria-hidden="true" className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl bg-linear-to-b from-gold-300 to-gold-400 text-[15px] font-bold text-psu-950">
                {getInitials(student.name, "ST")}
              </span>
            }
            label={
              <>
                <p className="truncate text-lg font-bold leading-tight tracking-tight text-slate-900 md:text-[21px]">{student.name}</p>
                {placement && <p className="truncate text-[12.5px] text-slate-600">{placement}</p>}
                {required > 0 && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <ProgressBar
                      value={percent}
                      label={`${formatHours(progress?.rendered)} of ${formatHours(required)} required hours verified`}
                      className="max-w-32 bg-psu-100"
                    />
                    <span className="tabular shrink-0 text-[12px] text-slate-600">
                      {formatHours(progress?.rendered)} of {formatHours(required)}
                    </span>
                  </div>
                )}
              </>
            }
          >
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3 md:mb-6">
              <div className="min-w-0">
                <h1 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl">{title}</h1>
                {subtitle && <p className="mt-0.5 text-sm text-slate-500 md:mt-1">{subtitle}</p>}
              </div>
              {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
            </div>
            <SavedDataNotice />
            <PhotoRedoBanner />
            <WaitingToSend />
            {children}
          </FolderShell>
          <MessageThreadHost role="student" />
        </div>
      </main>

      {/* Phones: the dock, and the next step of the day one tap away above it. */}
      <StudentDock
        scroller={scroller}
        items={FOLDER_TABS.slice(0, 4).map((item) => ({ ...item, count: counts[item.path] }))}
        more={[
          ...FOLDER_TABS.slice(4).map((item) => ({ ...item, count: counts[item.path] })),
          { ...RESOLUTION_NAV, count: counts[RESOLUTION_NAV.path] },
          { label: "Help", path: "/help", icon: "info" as const },
        ]}
      />
      <TimeInFab />

      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out?"
        message={
          unsent > 0
            ? `${unsent === 1 ? "1 attendance step you recorded offline has" : `${unsent} attendance steps you recorded offline have`} not been sent yet. Signing out now erases ${unsent === 1 ? "it" : "them"}. To keep ${unsent === 1 ? "it" : "them"}, stay signed in until this phone is connected and ${unsent === 1 ? "it has" : "they have"} been sent.`
            : "You will need your password to sign in again."
        }
        confirmLabel={unsent > 0 ? "Sign out and erase" : "Sign out"}
        cancelLabel="Stay signed in"
        tone="danger"
        onConfirm={signOut}
        onCancel={() => setConfirmSignOut(false)}
      />
    </div>
  );
}

/**
 * The Resolution Center (concerns and evaluations) as an icon. Its name says
 * what the badge shows, so what is seen and what is announced agree.
 */
function ResolutionButton({ count }: { count: number }) {
  const shown = count > 99 ? "99+" : String(count);
  return (
    <Tooltip label={RESOLUTION_NAV.label} side="left">
      <NavLink
        to={RESOLUTION_NAV.path}
        aria-label={
          count > 0
            ? `${RESOLUTION_NAV.label}, ${count === 1 ? "1 concern" : `${count} concerns`} with a new reply`
            : RESOLUTION_NAV.label
        }
        className={({ isActive }) =>
          `relative flex h-11 w-11 items-center justify-center rounded-lg text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
            isActive ? "bg-white/15" : ""
          }`
        }
      >
        <Icon name={RESOLUTION_NAV.icon} />
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

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-400 text-xs font-bold text-psu-950">
      {getInitials(name, "ST")}
    </span>
  );
}
