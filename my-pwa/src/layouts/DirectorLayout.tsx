import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useRoleTheme } from "../brand/useRoleTheme";
import NotificationBell from "../components/NotificationBell";
import RoleShell, { type SideItem } from "../components/RoleShell";
import type { DockGroup, DockItem } from "../components/RoleDock";
import SavedDataNotice from "../components/SavedDataNotice";
import { ConfirmDialog } from "../components/ui";
import { getInitials } from "../lib/format";
import { useMediaQuery } from "../lib/useMediaQuery";
import { signOut as endSession, useAccount } from "../lib/session";

/*
|--------------------------------------------------------------------------
| THE OJT DIRECTOR'S PORTAL LAYOUT (Phase 1.6)
|--------------------------------------------------------------------------
|
| The OJT office: the supervisor's night and brass (components/RoleShell.tsx
| draws the frame); what sets it apart is the row of college marks on its
| pages. A side menu on a tablet or computer, a dock on a phone:
|
|   Campus       Overview, Approvals
|   Office       Programs, Coordinators, Rules
|   Reports      Reports
|
| Help and Notifications are in More on a phone. Every entry is one page,
| named as it is titled.
|
*/

const HOME = "/director/overview";

const DOCK: DockItem[] = [
  { label: "Overview", path: HOME, icon: "home" },
  { label: "Approvals", path: "/director/approvals", icon: "check" },
  { label: "Coordinators", path: "/director/coordinators", icon: "users" },
  { label: "Rules", path: "/director/rules", icon: "sliders" },
];

const MORE: DockGroup[] = [
  {
    label: "Office",
    items: [
      { label: "Programs", path: "/director/programs", icon: "cap" },
      { label: "Reports", path: "/director/reports", icon: "chart" },
    ],
  },
  {
    label: "You",
    items: [
      { label: "Notifications", path: "/director/notifications", icon: "bell" },
      { label: "Help", path: "/director/help", icon: "help" },
    ],
  },
];

const SIDE: SideItem[] = [
  { label: "Overview", path: HOME, icon: "home" },
  { label: "Approvals", path: "/director/approvals", icon: "check" },
  { label: "Programs", path: "/director/programs", icon: "cap", section: "Office" },
  { label: "Coordinators", path: "/director/coordinators", icon: "users" },
  { label: "Rules", path: "/director/rules", icon: "sliders" },
  { label: "Reports", path: "/director/reports", icon: "chart", section: "Reports" },
  { label: "Notifications", path: "/director/notifications", icon: "bell", section: "You" },
  { label: "Help", path: "/director/help", icon: "help" },
];

export default function DirectorLayout({
  title,
  actions,
  children,
}: {
  title: string;
  /** Buttons shown beside the page title. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  useRoleTheme("director");
  const navigate = useNavigate();
  const director = useAccount("director");
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const tablet = useMediaQuery("(min-width: 768px)");

  useEffect(() => {
    document.title = `${title} · INTERNet`;
  }, [title]);

  if (!director) return <Navigate to="/director/sign-in" replace />;

  const signOut = () => {
    endSession("director");
    navigate("/director/sign-in", { replace: true });
  };

  return (
    <>
      <RoleShell
        role="director"
        title={title}
        headerRight={
          <>
            {tablet && actions && <div className="flex items-center gap-2">{actions}</div>}
            <NotificationBell
              role="director"
              viewAllPath="/director/notifications"
              buttonClassName="relative flex h-11 w-11 items-center justify-center rounded-xl border border-white/25 text-white hover:bg-white/10 md:border-(--role-hairline) md:bg-white md:text-(--role-ink) md:hover:bg-slate-50"
            />
          </>
        }
        side={SIDE}
        dock={DOCK}
        more={MORE}
        account={{
          initials: getInitials(director.name, "OD"),
          name: director.name,
          detail: "OJT Director",
          profilePath: "/director/profile",
          onSignOut: () => setConfirmSignOut(true),
        }}
      >
        <div className="mx-auto w-full max-w-7xl animate-page-in px-4 pb-32 pt-4 md:px-8 md:pb-12 md:pt-6 print:max-w-none print:p-0">
          {!tablet && actions && <div className="mb-4 flex flex-wrap justify-end gap-2">{actions}</div>}
          <SavedDataNotice />
          {children}
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
