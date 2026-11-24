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
import { HUBS, hubAddresses, hubFor, type HubId } from "../pages/student/hubs";
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
| change1108: the menus list only the folders, never their parts (the
| parts are the folder's tabs): Today, Attendance, Tasks, Reports and
| Support. Phone: the amber header with Scan, Help and the bell; the cream
| dock with Today, Attendance, Tasks, Reports and More (Support, then the
| account and Sign out). Tablet and computer: the side menu is a rail of
| icons that opens over the page while the pointer rests on it (RoleShell
| rail="hover"), so the page keeps the width; the profile stays a round
| badge with a tooltip. With the menu out of the way, the page's side
| margins and the folder's are half what they were. Help is no longer a menu entry: the header's
| Help button holds all of it (components/ScreenHelp.tsx). Scan opens "Time
| in from your phone" on a computer and the day's next step on a phone
| (pages/student/ScanButton.tsx), in place of the floating button.
|
| Every page also gets the retake banner while a new time-in photo is due
| and the steps waiting to send.
|
*/

/** A folder as one menu entry: its first part, and every other part's address as its own. */
function folderEntry(id: HubId): DockItem {
  const hub = HUBS.find((item) => item.id === id)!;
  return { label: hub.label, path: hub.tabs[0].path, icon: hub.icon, also: hubAddresses(id) };
}

const DOCK: DockItem[] = [{ label: "Today", path: "/student/dashboard", icon: "home" }, folderEntry("attendance"), folderEntry("tasks"), folderEntry("reports")];

const MORE: DockGroup[] = [{ label: "Folders", items: [folderEntry("support")] }];

/** What waits in a folder: the sum of its parts' counts. */
function folderCount(path: string, counts: Record<string, number | undefined>): number | undefined {
  const hub = HUBS.find((item) => item.tabs[0].path === path);
  if (!hub) return counts[path];
  const sum = [...new Set(hub.tabs.map((tab) => tab.path.split("?")[0]))].reduce((total, key) => total + (counts[key] ?? 0), 0);
  return sum > 0 ? sum : undefined;
}

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
  /** Not shown since the 2026-11-12 trim: the header's line is always the company, and the page's tabs say the rest. */
  subtitle?: string;
  /** The page's own buttons, at the right of the folder's label (every width). */
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

function StudentChrome({ title, actions, showPhotoRedo = true, folderLabel, children }: LayoutProps) {
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
  // Phase 1.8: on a shared phone, what waits to be sent is erased too; otherwise it waits for this account.
  const [sharedPhone, setSharedPhone] = useState(false);
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

  const waiting = unsent > 0 || unsentPhotos > 0;
  const signOut = () => {
    // What waits to be sent stays for this account's next sign-in on this phone, unless the phone is shared.
    endSession("student", { keepWaiting: waiting && !sharedPhone });
    navigate("/", { replace: true });
  };
  const lost = [
    unsent > 0 ? (unsent === 1 ? "1 attendance step" : `${unsent} attendance steps`) : "",
    unsentPhotos > 0 ? (unsentPhotos === 1 ? "1 report photo" : `${unsentPhotos} report photos`) : "",
  ].filter(Boolean).join(" and ");

  const waitingBadge =
    waitingCount > 0 ? (
      <span data-testid="waiting-badge" className="role-dock-badge role-dock-badge--waiting tabular">
        {waitingCount}
        <span className="sr-only">{waitingCount === 1 ? " step" : " steps"} waiting to send</span>
      </span>
    ) : null;
  const dock = DOCK.map((item) => ({
    ...item,
    count: item.path === "/daily-log" && waitingCount > 0 ? undefined : folderCount(item.path, counts),
    badge: item.path === "/daily-log" ? waitingBadge : undefined,
  }));
  const more = MORE.map((group) => ({ ...group, items: group.items.map((item) => ({ ...item, count: folderCount(item.path, counts) })) }));
  // The side menu lists the folders, the same five as the dock and More.
  const side: SideItem[] = [...dock, ...more.flatMap((group) => group.items)].map((item) => ({ label: item.label, path: item.path, icon: item.icon, count: item.count, also: item.also }));
  const plainLabel: FolderLabel = folderLabel ?? { icon: PLAIN_ICON[pathname] ?? "folder", title };
  const programLine = [student.student_id, student.program].filter(Boolean).join(" · ");

  return (
    <>
      <RoleShell
        role="student"
        title={title}
        context={student.company ?? undefined}
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
        rail="hover"
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
        <div className="mx-auto w-full max-w-7xl animate-page-in px-4 pb-32 pt-4 md:pb-12 md:pt-5 print:max-w-none print:p-0">
          <SavedDataNotice />
          {showPhotoRedo && <PhotoRedoBanner />}
          <WaitingToSend />
          <StudentFolder hub={inHub?.hub} tab={inHub?.tab} label={inHub ? folderLabel : plainLabel} counts={counts} actions={actions} pageTitle={title}>
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
            ? `${unsent === 1 ? "1 attendance step you recorded offline has" : `${unsent} attendance steps you recorded offline have`} not been sent yet.${unsentPhotos > 0 ? ` ${unsentPhotos === 1 ? "1 report photo is" : `${unsentPhotos} report photos are`} waiting too.` : ""} ${unsent + unsentPhotos === 1 ? "It stays" : "They stay"} on this phone and ${unsent + unsentPhotos === 1 ? "is" : "are"} sent the next time you sign in here.`
            : unsentPhotos > 0
              ? `${unsentPhotos === 1 ? "1 report photo is" : `${unsentPhotos} report photos are`} saved on this phone and not sent yet. ${unsentPhotos === 1 ? "It stays" : "They stay"} on this phone and ${unsentPhotos === 1 ? "is" : "are"} sent the next time you sign in here.`
              : "You will need your password to sign in again."
        }
        confirmLabel={waiting && sharedPhone ? "Sign out and erase" : "Sign out"}
        cancelLabel="Stay signed in"
        tone={waiting && sharedPhone ? "danger" : "primary"}
        onConfirm={signOut}
        onCancel={() => {
          setConfirmSignOut(false);
          setSharedPhone(false);
        }}
      >
        {waiting && (
          <div className="space-y-2">
            <label className="flex min-h-11 items-start gap-2.5 text-sm text-slate-800">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={sharedPhone} onChange={(event) => setSharedPhone(event.target.checked)} />
              This is a shared phone: also erase anything waiting to send
            </label>
            {sharedPhone && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                Erased and never sent: {lost}. Your supervisor will not see {unsent + unsentPhotos === 1 ? "it" : "them"}.
              </p>
            )}
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}
