import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useRoleTheme } from "../brand/useRoleTheme";
import Onboarding from "../components/Onboarding";
import ComposeMessage from "../components/ComposeMessage";
import CoordinatorSearch from "../components/CoordinatorSearch";
import MessageThreadHost from "../components/MessageThreadHost";
import NotificationBell from "../components/NotificationBell";
import RoleShell, { type SideItem } from "../components/RoleShell";
import type { DockGroup, DockItem } from "../components/RoleDock";
import ScreenHelp from "../components/ScreenHelp";
import { Button, ConfirmDialog } from "../components/ui";
import { getInitials } from "../lib/format";
import { useNavCounts } from "../lib/navCounts";
import { signOut as endSession, useAccount } from "../lib/session";
import { HUBS, useHub } from "../pages/coordinator/hubConfig";
import HubNav from "../pages/coordinator/HubNav";

/*
|--------------------------------------------------------------------------
| COORDINATOR PORTAL LAYOUT
|--------------------------------------------------------------------------
|
| PSU redesign, Section 11 (components/RoleShell.tsx draws the frame). The
| coordinator's route map: a flat navy header with only the bell; on a phone
| a navy dock with a gold pill (Home, Decide, Trainees, Reports, More), More
| with "Find anyone" at the top. On a tablet or computer a navy (#121A5E)
| side menu: "Find anyone" ("/" jumps to it), then text-first groups that
| open one at a time, with no icon tiles:
|
|   Home      Needs you, figures, this week
|   Decide    Appeals, Flagged logs, Complaints
|   People    Students, Supervisors, Companies, Coordinators
|   Term      Term setup, Programs, Schedules and holidays, Deliverables,
|             Evaluation form, Site visits
|   Talk      Messages, Announcements
|   Reports   Analytics, Monitoring, Audit log, System status
|
| Pages about one subject are still tabs of one hub
| (pages/coordinator/hubConfig.ts); the hub's tabs are drawn above the page.
|
*/

const RESOLUTION = HUBS.resolution.path;

const DOCK: DockItem[] = [
  { label: "Home", path: "/coordinator/dashboard", icon: "home" },
  { label: "Decide", path: RESOLUTION, icon: "flag" },
  { label: "Trainees", path: "/coordinator/students", icon: "users" },
  { label: "Reports", path: "/coordinator/analytics", icon: "chart" },
];

const MORE: DockGroup[] = [
  {
    label: "Decide",
    items: [
      { label: "Appeals", path: `${RESOLUTION}?tab=appeals`, icon: "flag" },
      { label: "Flagged logs", path: "/coordinator/monitoring?scope=attention", icon: "alert" },
      { label: "Complaints", path: RESOLUTION, icon: "chat" },
    ],
  },
  {
    label: "People",
    items: [
      { label: "Students", path: "/coordinator/students", icon: "users" },
      { label: "Supervisors", path: "/coordinator/companies?tab=supervisors", icon: "briefcase" },
      { label: "Companies", path: "/coordinator/companies", icon: "building" },
    ],
  },
  {
    label: "Term",
    items: [
      { label: "Term setup", path: "/coordinator/students?tab=terms", icon: "calendar" },
      { label: "Programs", path: "/coordinator/programs", icon: "cap" },
      { label: "Schedules and holidays", path: "/coordinator/holidays", icon: "clock" },
      { label: "Deliverables", path: "/coordinator/documents?tab=requirements", icon: "document" },
      { label: "Evaluation form", path: `${RESOLUTION}?tab=evaluations`, icon: "star" },
      { label: "Site visits", path: "/coordinator/companies?tab=site-visits", icon: "building" },
    ],
  },
  {
    label: "Talk",
    items: [
      { label: "Messages", path: "/coordinator/messages", icon: "chat" },
      { label: "Announcements", path: "/coordinator/announcements", icon: "megaphone" },
    ],
  },
  {
    label: "Reports",
    items: [
      { label: "Analytics", path: "/coordinator/analytics", icon: "chart" },
      { label: "Monitoring", path: "/coordinator/monitoring", icon: "activity" },
      { label: "Audit log", path: "/coordinator/profile?section=audit", icon: "clipboard" },
      { label: "System status", path: "/coordinator/profile?section=status", icon: "sliders" },
      { label: "Help", path: "/help", icon: "help" },
    ],
  },
];

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
   * The title still names the browser tab and the header.
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
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [writing, setWriting] = useState(false);
  // A student's record draws its own heading; its Message action is added here.
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

  const decide = counts[RESOLUTION] ?? 0;
  const flagged = counts["/coordinator/monitoring"] ?? 0;
  const side: SideItem[] = [
    { label: "Home", path: "/coordinator/dashboard", icon: "home", detail: "Needs you, figures, this week" },
    {
      label: "Decide",
      icon: "flag",
      count: decide + flagged,
      also: [RESOLUTION, "/coordinator/monitoring"],
      children: [
        { label: "Appeals", path: `${RESOLUTION}?tab=appeals` },
        { label: "Flagged logs", path: "/coordinator/monitoring?scope=attention", count: flagged },
        { label: "Complaints", path: RESOLUTION, count: decide },
      ],
    },
    {
      label: "People",
      icon: "users",
      detail: "Students, supervisors, companies",
      also: ["/coordinator/students", "/coordinator/companies", "/coordinator/supervisors"],
      children: [
        { label: "Students", path: "/coordinator/students" },
        { label: "Supervisors", path: "/coordinator/companies?tab=supervisors" },
        { label: "Companies", path: "/coordinator/companies" },
        { label: "Coordinators", path: "/coordinator/profile?section=coordinators" },
      ],
    },
    {
      label: "Term",
      icon: "calendar",
      detail: "Setup, schedules, deliverables, visits",
      also: ["/coordinator/programs", "/coordinator/holidays", "/coordinator/documents"],
      children: [
        { label: "Term setup", path: "/coordinator/students?tab=terms" },
        { label: "Programs", path: "/coordinator/programs" },
        { label: "Schedules and holidays", path: "/coordinator/holidays" },
        { label: "Deliverables", path: "/coordinator/documents?tab=requirements" },
        { label: "Documents", path: "/coordinator/documents" },
        { label: "Evaluation form", path: `${RESOLUTION}?tab=evaluations` },
        { label: "Site visits", path: "/coordinator/companies?tab=site-visits" },
      ],
    },
    {
      label: "Talk",
      icon: "chat",
      detail: "Messages and announcements",
      also: ["/coordinator/messages", "/coordinator/announcements"],
      children: [
        { label: "Messages", path: "/coordinator/messages" },
        { label: "Announcements", path: "/coordinator/announcements" },
      ],
    },
    {
      label: "Reports",
      icon: "chart",
      detail: "Analytics, audit log, system status",
      also: ["/coordinator/analytics", "/coordinator/audit"],
      children: [
        { label: "Analytics", path: "/coordinator/analytics" },
        { label: "Monitoring", path: "/coordinator/monitoring" },
        { label: "Audit log", path: "/coordinator/profile?section=audit" },
        { label: "System status", path: "/coordinator/profile?section=status" },
      ],
    },
  ];

  return (
    <>
      {/* Iteration 23: the first open of the installed app. */}
      <Onboarding role="coordinator" />
      <RoleShell
        role="coordinator"
        textFirst
        title={title}
        context={subtitle ?? coordinator.department ?? "Pangasinan State University · Lingayen Campus"}
        headerRight={
          <>
            <ScreenHelp role="coordinator" />
            <NotificationBell
              role="coordinator"
              viewAllPath="/coordinator/notifications"
              announcementsFor="coordinator"
              buttonClassName="relative flex h-11 w-11 items-center justify-center rounded-xl border border-white/25 text-white hover:bg-white/10 md:border-(--role-hairline) md:bg-white md:text-(--role-ink) md:hover:bg-slate-50"
            />
          </>
        }
        sideTop={<CoordinatorSearch tone="dark" shortcut />}
        side={side}
        dock={DOCK.map((item) => ({ ...item, count: item.path === RESOLUTION ? decide + flagged : counts[item.path] }))}
        more={MORE}
        moreSearch={(close) => (
          <div className="mb-1">
            <CoordinatorSearch tone="light" onGo={close} />
          </div>
        )}
        account={{
          initials: getInitials(coordinator.name, "OC"),
          name: coordinator.name,
          detail: coordinator.department || "OJT Coordinator",
          profilePath: "/coordinator/profile",
          onSignOut: () => setConfirmSignOut(true),
        }}
      >
        <div className="mx-auto w-full max-w-7xl animate-page-in px-4 pb-32 pt-4 md:px-8 md:pb-12 md:pt-6 print:max-w-none print:p-0">
          {!hideHeading && actions && <div className="mb-4 flex flex-wrap justify-end gap-2 print:hidden">{actions}</div>}
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
