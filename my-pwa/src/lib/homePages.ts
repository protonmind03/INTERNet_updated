import type { ComponentType } from "react";

/*
|--------------------------------------------------------------------------
| EACH ROLE'S FIRST PAGE
|--------------------------------------------------------------------------
|
| Iteration 14, prototype P2 (the shaped skeleton), chosen for after sign-in.
| The file of the page a role lands on is asked for the moment Sign in is
| tapped (pages/Door.tsx), at the same time as the sign-in itself, so the
| page's own shape is ready to draw when the answer comes. App.tsx loads the
| same files, so they are fetched once.
|
*/

export type HomeRole = "student" | "supervisor" | "coordinator" | "director" | "admin";

export const HOME_PATH: Record<HomeRole, string> = {
  student: "/student/dashboard",
  supervisor: "/supervisor/dashboard",
  coordinator: "/coordinator/dashboard",
  director: "/director/overview",
  admin: "/admin/accounts",
};

export const HOME_PAGE: Record<HomeRole, () => Promise<{ default: ComponentType }>> = {
  student: () => import("../pages/student/dashboard"),
  supervisor: () => import("../pages/supervisor/dashboardsp"),
  coordinator: () => import("../pages/coordinator/Dashboard"),
  director: () => import("../pages/director/Overview"),
  admin: () => import("../pages/admin/Accounts"),
};

/** Starts fetching a role's first page; a failure is left for the page itself to show. */
export function preloadHome(role: HomeRole): void {
  void HOME_PAGE[role]().catch(() => {});
}
