import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useRoleTheme } from "../brand/useRoleTheme";
import Onboarding from "../components/Onboarding";
import MessageThreadHost from "../components/MessageThreadHost";
import NotificationBell from "../components/NotificationBell";
import RoleShell, { type SideItem } from "../components/RoleShell";
import type { DockGroup, DockItem } from "../components/RoleDock";
import SavedDataNotice from "../components/SavedDataNotice";
import ScreenHelp from "../components/ScreenHelp";
import { ConfirmDialog } from "../components/ui";
import { getInitials } from "../lib/format";
import { useNavCounts } from "../lib/navCounts";
import { waitingSteps } from "../lib/offlineQueue";
import { pendingPhotos, usePendingPhotoSender } from "../lib/pendingPhotos";
import { signOut as endSession, useAccount } from "../lib/session";
import { useSpotlightParam } from "../lib/spotlight";
import { useWaitingCount } from "../lib/useWaitingCount";
import type { IconName } from "../components/Icon";
import { hubAddresses, hubFor } from "../pages/student/hubs";
import ScanButton from "../pages/student/ScanButton";
import StudentFolder from "../pages/student/StudentFolder";
import TimeInProvider from "../pages/student/TimeInProvider";
import { PhotoRedoBanner } from "../pages/student/PhotoRedo";
import WaitingToSend from "../pages/student/WaitingToSend";

/*
|--------------------------------------------------------------------------
| STUDENT (TRAINEE) PORTAL LAYOUT
|--------------------------------------------------------------------------
|
| PSU redesign, Section 7 (components/RoleShell.tsx draws the frame);
| revised November 2026. The trainee's pages are grouped into folders
| (pages/student/hubs.ts): Attendance (Days, Schedule, My progress, Time
| record), Tasks (Tasks, Documents, Reports, Narrative, Completion) and
| Support (Messages, Announcements, Resolution Center, which now also holds
| Feedback and the internship evaluation). Every page is drawn inside a
| folder (pages/student/StudentFolder.tsx), with the folder's parts as tabs.
|
| Phone: the amber header with Scan, Help and the bell; the cream dock with
| Today, Attendance, Tasks, Reports and More (Support, then the account and
| Sign out). Tablet and computer: a side menu with Today, Attendance, Tasks
| and the Support section. Help is no longer a menu entry: the header's
| Help button holds all of it (components/ScreenHelp.tsx). Scan opens "Time
| in from your phone" on a computer and the day's next step on a phone
| (pages/student/ScanButton.tsx), in place of the floating button.
|
| Every page also gets the retake banner while a new time-in photo is due
| and the steps waiting to send.
|
*/

const DOCK: DockItem[] = [
  { label: "Today", path: "/student/dashboard", icon: "home" },
  { label: "Attendance", path: "/daily-log", icon: "clock", also: hubAddresses("attendance") },
  { label: "Tasks", path: "/task", icon: "tasks", also: hubAddresses("tasks") },
  // The part of Tasks used every day; it lights instead of Tasks while open.
  { label: "Reports", path: "/journal", icon: "note" },
];

const SUPPORT: DockItem[] = [
  { label: "Messages", path: "/messages", icon: "chat" },
  { label: "Announcements", path: "/announcements", icon: "megaphone" },
  { label: "Resolution Center", path: "/student/resolution", icon: "flag", also: ["/student/feedback"] },
];

const MORE: DockGroup[] = [{ label: "Support", items: SUPPORT }];

/** The label tab's icon on a page that is not in a folder (Today, Profile…). */
const PLAIN_ICON: Record<string, IconName> = {
  "/student/dashboard": "home",
  "/profile": "user",
  "/notifications": "bell",
  "/student/help": "help",
};

export type FolderLabel = { icon: IconName; title: ReactNode; line?: ReactNode };

type LayoutProps = {
  title: string;
  /** The line under the title; the trainee's company when not given. */
  subtitle?: string;
  /** Buttons shown beside the page title on wide screens. */
  actions?: ReactNode;
  /** Today draws the retake row itself, among what needs the trainee. */
  showPhotoRedo?: boolean;
  /** What the folder's label tab says, in place of the folder's name or the page title. */
  folderLabel?: FolderLabel;
  children: ReactNode;
};

/**
 * Every student page is drawn inside this. It also holds the shared
 * time-in actions (the day's attendance and its dialogs), so any page can
 * offer the next step.
 */
export default function StudentLayout(props: LayoutProps) {
  useRoleTheme("student");
  // A notification opens a page with ?spot=<key>: that control is spotlighted (lib/spotlight.ts).
  useSpotlightParam();
  return (
    <TimeInProvider>
      {/* Iteration 23: the first open of the installed app. */}
      <Onboarding role="student" />
      <StudentChrome {...props} />
    </TimeInProvider>
  );
}

function StudentChrome({ title, subtitle, actions, showPhotoRedo = true, folderLabel, children }: LayoutProps) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const inHub = hubFor(pathname, search);
  const student = useAccount("student");
  const counts = useNavCounts("student");
  // Steps recorded offline still on this phone: a badge on Attendance in the dock.
  const waitingCount = useWaitingCount();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  // Steps recorded offline and not sent yet. Signing out erases them, so the question says how many there are.
  const [unsent, setUnsent] = useState(0);
  // Report photos kept on this phone are sent whenever it comes back online, from any page.
  usePendingPhotoSender();
  const [unsentPhotos, setUnsentPhotos] = useState(0);
  useEffect(() => {
    if (!confirmSignOut) return;
    let current = true;
    void waitingSteps().then((steps) => {
      if (current) setUnsent(steps.length);
    });
    void pendingPhotos().then((photos) => {
      if (current) setUnsentPhotos(photos.length);
    });
    return () => {
      current = false;
    };
  }, [confirmSignOut]);

  useEffect(() => {
    document.title = `${title} · INTERNet`;
  }, [title]);

  if (!student) return <Navigate to="/" replace />;

  const signOut = () => {
    endSession("student");
    navigate("/", { replace: true });
  };

  const waitingBadge =
    waitingCount > 0 ? (
      <span data-testid="waiting-badge" className="role-dock-badge role-dock-badge--waiting tabular">
        {waitingCount}
        <span className="sr-only">{waitingCount === 1 ? " step" : " steps"} waiting to send</span>
      </span>
    ) : null;
  const dock = DOCK.map((item) => ({
    ...item,
    count: item.path === "/daily-log" && waitingCount > 0 ? undefined : counts[item.path],
    badge: item.path === "/daily-log" ? waitingBadge : undefined,
  }));
  const more = MORE.map((group) => ({ ...group, items: group.items.map((item) => ({ ...item, count: counts[item.path] })) }));
  // The side menu lists the folders themselves; Reports is reached inside Tasks there.
  const side: SideItem[] = [
    ...dock
      .filter((item) => item.path !== "/journal")
      .map((item) => ({ label: item.label, path: item.path, icon: item.icon, count: item.count, also: item.also })),
    ...more.flatMap((group) =>
      group.items.map((item, index) => ({
        label: item.label,
        path: item.path,
        icon: item.icon,
        count: item.count,
        also: item.also,
        section: index === 0 ? group.label : undefined,
      }))
    ),
  ];
  const plainLabel: FolderLabel = folderLabel ?? { icon: PLAIN_ICON[pathname] ?? "folder", title, line: subtitle ?? student.company ?? undefined };
  const programLine = [student.student_id, student.program].filter(Boolean).join(" · ");

  return (
    <>
      <RoleShell
        role="student"
        title={title}
        context={subtitle ?? student.company ?? undefined}
        headerRight={
          <>
            <ScanButton />
            <ScreenHelp role="student" />
            <NotificationBell
              role="student"
              announcementsFor="student"
              buttonClassName="relative flex h-11 w-11 items-center justify-center rounded-xl border border-white/25 text-white hover:bg-white/10 md:border-(--role-hairline) md:bg-white md:text-(--role-ink) md:hover:bg-slate-50"
            />
          </>
        }
        side={side}
        dock={dock}
        more={more}
        account={{
          initials: getInitials(student.name, "ST"),
          name: student.name,
          detail: programLine || student.email,
          profilePath: "/profile",
          onSignOut: () => setConfirmSignOut(true),
        }}
      >
        <div className="mx-auto w-full max-w-6xl animate-page-in px-4 pb-32 pt-4 md:px-8 md:pb-12 md:pt-6 print:max-w-none print:p-0">
          {actions && <div className="mb-4 hidden flex-wrap justify-end gap-2 md:flex">{actions}</div>}
          <SavedDataNotice />
          {showPhotoRedo && <PhotoRedoBanner />}
          <WaitingToSend />
          <StudentFolder hub={inHub?.hub} tab={inHub?.tab} label={inHub ? folderLabel : plainLabel} counts={counts}>
            {children}
          </StudentFolder>
          <MessageThreadHost role="student" />
        </div>
      </RoleShell>

      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out?"
        message={
          unsent > 0
            ? `${unsent === 1 ? "1 attendance step you recorded offline has" : `${unsent} attendance steps you recorded offline have`} not been sent yet. Signing out now erases ${unsent === 1 ? "it" : "them"}. To keep ${unsent === 1 ? "it" : "them"}, stay signed in until this phone is connected and ${unsent === 1 ? "it has" : "they have"} been sent.${unsentPhotos > 0 ? ` ${unsentPhotos === 1 ? "1 report photo is" : `${unsentPhotos} report photos are`} waiting too.` : ""}`
            : unsentPhotos > 0
              ? `${unsentPhotos === 1 ? "1 report photo is" : `${unsentPhotos} report photos are`} saved on this phone and not sent yet. Signing out erases ${unsentPhotos === 1 ? "it" : "them"}: stay signed in until you're back online, or save copies to your phone from Progress reports first.`
              : "You will need your password to sign in again."
        }
        confirmLabel={unsent > 0 || unsentPhotos > 0 ? "Sign out and erase" : "Sign out"}
        cancelLabel="Stay signed in"
        tone="danger"
        onConfirm={signOut}
        onCancel={() => setConfirmSignOut(false)}
      />
    </>
  );
}
