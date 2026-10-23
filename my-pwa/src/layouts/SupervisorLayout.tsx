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
import { signOut as endSession, useAccount } from "../lib/session";

/*
|--------------------------------------------------------------------------
| SUPERVISOR PORTAL LAYOUT
|--------------------------------------------------------------------------
|
| PSU redesign, Section 10 (components/RoleShell.tsx draws the frame). The
| supervisor's logbook: a flat green header with faint ruled lines and only
| the bell; on a phone the green dock with Review, Interns, Tasks,
| Attendance and More. On a tablet or computer a solid green side menu:
| the company at the top, the account at the bottom, and groups that open
| one at a time:
|
|   Review     Time-ins, Tasks, Documents, Absences
|   Interns
|   Work       Tasks, Weekly reports
|   Evaluate   Final evaluations, Time records to certify
|   Talk       Messages, Announcements, Incidents
|
| Staff notes are kept on each intern's page, where they are written.
|
*/

const REVIEW = "/supervisor/dashboard";

const DOCK: DockItem[] = [
  { label: "Review", path: REVIEW, icon: "tasks" },
  { label: "Interns", path: "/supervisor/interns", icon: "users" },
  { label: "Tasks", path: "/supervisor/tasks", icon: "clipboard" },
  { label: "Attendance", path: "/supervisor/attendance", icon: "clock" },
];

const MORE: DockGroup[] = [
  {
    label: "Interns' work",
    items: [
      { label: "Documents", path: "/supervisor/documents", icon: "document" },
      { label: "Weekly reports", path: "/supervisor/journals", icon: "note" },
      { label: "Evaluations", path: "/supervisor/evaluation", icon: "star" },
      { label: "Time records", path: "/supervisor/time-record", icon: "printer" },
    ],
  },
  {
    label: "Talk",
    items: [
      { label: "Messages", path: "/supervisor/messages", icon: "chat" },
      { label: "Announcements", path: "/supervisor/announcements", icon: "megaphone" },
      { label: "Incidents", path: "/supervisor/complaints", icon: "flag" },
    ],
  },
  {
    label: "You",
    items: [
      { label: "Help", path: "/help", icon: "help" },
      { label: "Profile", path: "/supervisor/profile", icon: "user" },
    ],
  },
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
  useRoleTheme("supervisor");
  const navigate = useNavigate();
  const supervisor = useAccount("supervisor");
  const counts = useNavCounts("supervisor");
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  useEffect(() => {
    document.title = `${title} · INTERNet`;
  }, [title]);

  if (!supervisor) return <Navigate to="/" replace />;

  const signOut = () => {
    endSession("supervisor");
    navigate("/", { replace: true });
  };

  const waiting = counts[REVIEW] ?? 0;
  const side: SideItem[] = [
    {
      label: "Review",
      path: REVIEW,
      icon: "tasks",
      count: waiting,
      children: [
        { label: "Time-ins", path: "/supervisor/attendance" },
        { label: "Tasks", path: `${REVIEW}?tab=tasks` },
        { label: "Documents", path: "/supervisor/documents" },
        { label: "Absences", path: `${REVIEW}?tab=absences` },
      ],
    },
    { label: "Interns", path: "/supervisor/interns", icon: "users", detail: "Interns, teams, schedules" },
    {
      label: "Work",
      icon: "clipboard",
      detail: "Tasks, weekly reports",
      children: [
        { label: "Tasks", path: "/supervisor/tasks" },
        { label: "Weekly reports", path: "/supervisor/journals" },
      ],
    },
    {
      label: "Evaluate",
      icon: "star",
      detail: "Final evaluations, time records",
      children: [
        { label: "Final evaluations", path: "/supervisor/evaluation" },
        { label: "Time records to certify", path: "/supervisor/time-record" },
      ],
    },
    {
      label: "Talk",
      icon: "chat",
      detail: "Messages, announcements, incidents",
      children: [
        { label: "Messages", path: "/supervisor/messages" },
        { label: "Announcements", path: "/supervisor/announcements" },
        { label: "Incidents", path: "/supervisor/complaints" },
      ],
    },
  ];
  const company = supervisor.company || "Your company";

  return (
    <>
      {/* Iteration 23: the first open of the installed app. */}
      <Onboarding role="supervisor" />
      <RoleShell
        role="supervisor"
        title={title}
        context={subtitle ?? [supervisor.company, supervisor.department].filter(Boolean).join(" · ")}
        headerRight={
          <>
            <ScreenHelp role="supervisor" />
            <NotificationBell
              role="supervisor"
              announcementsFor="supervisor"
              buttonClassName="relative flex h-11 w-11 items-center justify-center rounded-xl border border-white/25 text-white hover:bg-white/10 md:border-(--role-hairline) md:bg-white md:text-(--role-ink) md:hover:bg-slate-50"
            />
          </>
        }
        sideTop={
          <div className="flex items-center gap-3 rounded-xl bg-white/12 px-3 py-2.5">
            <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-sm font-extrabold text-(--role-chrome)">
              {getInitials(company, "CO").slice(0, 1)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[14.5px] font-bold">{company}</span>
              {supervisor.department && <span className="block truncate text-xs opacity-80">{supervisor.department}</span>}
            </span>
          </div>
        }
        side={side}
        dock={DOCK.map((item) => ({ ...item, count: counts[item.path] }))}
        more={MORE.map((group) => ({ ...group, items: group.items.map((item) => ({ ...item, count: counts[item.path] })) }))}
        account={{
          initials: getInitials(supervisor.name, "SV"),
          name: supervisor.name,
          detail: supervisor.department || supervisor.company || supervisor.email,
          profilePath: "/supervisor/profile",
          onSignOut: () => setConfirmSignOut(true),
        }}
      >
        <div className="mx-auto w-full max-w-7xl animate-page-in px-4 pb-32 pt-4 md:px-8 md:pb-12 md:pt-6 print:max-w-none print:p-0">
          {actions && <div className="mb-4 flex flex-wrap justify-end gap-2">{actions}</div>}
          <SavedDataNotice />
          {children}
          <MessageThreadHost role="supervisor" />
        </div>
      </RoleShell>

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
    </>
  );
}
