import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
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
import { signOut as endSession, useAccount } from "../lib/session";
import { useSpotlightParam } from "../lib/spotlight";
import { useWaitingCount } from "../lib/useWaitingCount";
import TimeInFab from "../pages/student/TimeInFab";
import TimeInProvider from "../pages/student/TimeInProvider";
import { PhotoRedoBanner } from "../pages/student/PhotoRedo";
import WaitingToSend from "../pages/student/WaitingToSend";

/*
|--------------------------------------------------------------------------
| STUDENT (TRAINEE) PORTAL LAYOUT
|--------------------------------------------------------------------------
|
| PSU redesign, Section 7 (components/RoleShell.tsx draws the frame). On a
| phone: the flat amber header with the lane-dash strip and only the bell;
| the cream dock with Today, Attendance, Schedule, Tasks and More. More is
| grouped: My OJT (Documents, Weekly report, Completion, Time record),
| Messages (Messages, Announcements, Resolution Center) and Support (Help,
| Feedback), with the account (which opens Profile) and Sign out at the
| bottom; in the side menu the account at the foot opens Profile.
| Notifications live on the bell only. On a tablet or computer the same
| destinations are a side menu in the trainee's amber.
|
| Every page also gets: "Help for this screen" (components/ScreenHelp.tsx),
| the retake banner while a new time-in photo is due, the steps waiting to
| send, and the floating next-step button on a phone.
|
*/

const DOCK: DockItem[] = [
  { label: "Today", path: "/student/dashboard", icon: "home" },
  { label: "Attendance", path: "/daily-log", icon: "clock" },
  { label: "Schedule", path: "/schedule", icon: "calendar" },
  { label: "Tasks", path: "/task", icon: "tasks" },
];

const MORE: DockGroup[] = [
  {
    label: "My OJT",
    items: [
      { label: "Documents", path: "/documents", icon: "document" },
      { label: "Weekly report", path: "/journal", icon: "note" },
      { label: "Completion", path: "/student/completion", icon: "check-circle" },
      { label: "Time record", path: "/time-record", icon: "printer" },
    ],
  },
  {
    label: "Messages",
    items: [
      { label: "Messages", path: "/messages", icon: "chat" },
      { label: "Announcements", path: "/announcements", icon: "megaphone" },
      { label: "Resolution Center", path: "/student/resolution", icon: "flag" },
    ],
  },
  {
    label: "Support",
    items: [
      { label: "Help", path: "/student/help", icon: "help" },
      { label: "Feedback", path: "/student/feedback", icon: "star" },
    ],
  },
];

type LayoutProps = {
  title: string;
  /** The line under the title; the trainee's company when not given. */
  subtitle?: string;
  /** Buttons shown beside the page title on wide screens. */
  actions?: ReactNode;
  /** Today draws the retake row itself, among what needs the trainee. */
  showPhotoRedo?: boolean;
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

function StudentChrome({ title, subtitle, actions, showPhotoRedo = true, children }: LayoutProps) {
  const navigate = useNavigate();
  const student = useAccount("student");
  const counts = useNavCounts("student");
  // Steps recorded offline still on this phone: a badge on Attendance in the dock.
  const waitingCount = useWaitingCount();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  // Steps recorded offline and not sent yet. Signing out erases them, so the question says how many there are.
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
  const side: SideItem[] = [
    ...dock.map((item) => ({ label: item.label, path: item.path, icon: item.icon, count: item.count })),
    ...more.flatMap((group) =>
      group.items.map((item, index) => ({ label: item.label, path: item.path, icon: item.icon, count: item.count, section: index === 0 ? group.label : undefined }))
    ),
  ];
  const programLine = [student.student_id, student.program].filter(Boolean).join(" · ");

  return (
    <>
      <RoleShell
        role="student"
        title={title}
        context={subtitle ?? student.company ?? undefined}
        headerRight={
          <>
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
          {children}
          <MessageThreadHost role="student" />
        </div>
      </RoleShell>
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
    </>
  );
}
