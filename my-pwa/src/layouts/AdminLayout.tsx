import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useRoleTheme } from "../brand/useRoleTheme";
import NotificationBell from "../components/NotificationBell";
import RoleShell, { type SideItem } from "../components/RoleShell";
import type { DockGroup, DockItem } from "../components/RoleDock";
import { ConfirmDialog } from "../components/ui";
import { getInitials } from "../lib/format";
import { useMediaQuery } from "../lib/useMediaQuery";
import { signOut as endSession, useAccount } from "../lib/session";

/*
|--------------------------------------------------------------------------
| THE SYSTEM ADMINISTRATOR'S PORTAL LAYOUT (Phase 1.7)
|--------------------------------------------------------------------------
|
| "The machine room": mist with navy ink and no brass, the opposite of the
| academic portals, so nobody mistakes where they are. A side menu on a
| tablet or computer, a dock on a phone:
|
|   Accounts       the home page
|   System         System status, Backups, Warnings, Notice
|   Records        Audit log
|
| Help and Notifications are in More on a phone. It shows no student
| record anywhere, and keeps nothing personal on the device.
|
*/

const HOME = "/admin/accounts";

const DOCK: DockItem[] = [
  { label: "Accounts", path: HOME, icon: "users" },
  { label: "Status", path: "/admin/status", icon: "activity" },
  { label: "Backups", path: "/admin/backups", icon: "layers" },
  { label: "Audit log", path: "/admin/audit", icon: "list" },
];

const MORE: DockGroup[] = [
  {
    label: "System",
    items: [
      { label: "Warnings", path: "/admin/warnings", icon: "shield" },
      { label: "Notice", path: "/admin/notice", icon: "megaphone" },
    ],
  },
  {
    label: "You",
    items: [
      { label: "Notifications", path: "/admin/notifications", icon: "bell" },
      { label: "Help", path: "/admin/help", icon: "help" },
    ],
  },
];

const SIDE: SideItem[] = [
  { label: "Accounts", path: HOME, icon: "users" },
  { label: "System status", path: "/admin/status", icon: "activity", section: "System" },
  { label: "Backups", path: "/admin/backups", icon: "layers" },
  { label: "Warnings", path: "/admin/warnings", icon: "shield" },
  { label: "Notice", path: "/admin/notice", icon: "megaphone" },
  { label: "Audit log", path: "/admin/audit", icon: "list", section: "Records" },
  { label: "Notifications", path: "/admin/notifications", icon: "bell", section: "You" },
  { label: "Help", path: "/admin/help", icon: "help" },
];

export default function AdminLayout({
  title,
  actions,
  children,
}: {
  title: string;
  /** Buttons shown beside the page title. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  useRoleTheme("admin");
  const navigate = useNavigate();
  const admin = useAccount("admin");
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const tablet = useMediaQuery("(min-width: 768px)");

  useEffect(() => {
    document.title = `${title} · INTERNet System`;
  }, [title]);

  if (!admin) return <Navigate to="/admin/sign-in" replace />;

  const signOut = () => {
    endSession("admin");
    navigate("/admin/sign-in", { replace: true });
  };

  return (
    <>
      <RoleShell
        role="admin"
        title={title}
        headerRight={
          <>
            {tablet && actions && <div className="flex items-center gap-2">{actions}</div>}
            <NotificationBell
              role="admin"
              viewAllPath="/admin/notifications"
              buttonClassName="relative flex h-11 w-11 items-center justify-center rounded-xl border border-(--role-hairline) bg-white text-(--role-ink) hover:bg-slate-50"
            />
          </>
        }
        side={SIDE}
        dock={DOCK}
        more={MORE}
        account={{
          initials: getInitials(admin.name, "SA"),
          name: admin.name,
          detail: "System administrator",
          profilePath: "/admin/profile",
          onSignOut: () => setConfirmSignOut(true),
        }}
      >
        <div className="mx-auto w-full max-w-7xl animate-page-in px-4 pb-32 pt-4 md:px-8 md:pb-12 md:pt-6 print:max-w-none print:p-0">
          {!tablet && actions && <div className="mb-4 flex flex-wrap justify-end gap-2">{actions}</div>}
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
