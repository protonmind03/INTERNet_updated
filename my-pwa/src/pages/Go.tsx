import { Navigate, useParams } from "react-router-dom";
import type { SessionRole } from "../lib/session";

/*
|--------------------------------------------------------------------------
| SHORTCUT LINKS
|--------------------------------------------------------------------------
|
| The installed app's shortcuts (long-press the icon; listed in
| public/manifest.json) cannot know who is signed in, so they point at
| /go/<target> and this page sends each role to its own version of that
| place. Nobody signed in, or an unknown target, goes to the sign-in page,
| which itself forwards a signed-in person to their portal.
|
*/

const PLACES: Record<string, Record<SessionRole, string>> = {
  today: {
    student: "/daily-log",
    supervisor: "/supervisor/dashboard",
    coordinator: "/coordinator/monitoring",
  },
  tasks: {
    student: "/task",
    supervisor: "/supervisor/tasks",
    coordinator: "/coordinator/dashboard",
  },
  notifications: {
    student: "/notifications",
    supervisor: "/supervisor/notifications",
    coordinator: "/coordinator/notifications",
  },
};

const ROLES: SessionRole[] = ["student", "supervisor", "coordinator"];

export default function Go() {
  const { target = "" } = useParams();
  let role: SessionRole | null = null;
  try {
    const active = localStorage.getItem("active_role") as SessionRole | null;
    if (active && ROLES.includes(active) && localStorage.getItem(`${active}_token`)) role = active;
  } catch {
    /* no storage: treated as signed out */
  }
  const place = role ? PLACES[target]?.[role] : undefined;
  return <Navigate to={place ?? "/"} replace />;
}
