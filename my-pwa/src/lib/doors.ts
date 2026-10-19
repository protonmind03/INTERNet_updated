import type { Role } from "../brand";

/*
| Iteration 23: the three doors' words, and which door to open. The doors
| themselves are pages/Door.tsx.
*/

export const DOOR_ROLES: Role[] = ["student", "supervisor", "coordinator"];

export const DOOR_COPY: Record<
  Role,
  {
    name: string;
    article: string;
    appName: string;
    idLabel: string;
    idPlaceholder: string;
    idHelp: string;
    idMode: "text" | "email";
    button: string;
    welcome: string;
    wrong: string;
  }
> = {
  student: {
    name: "Trainee",
    article: "a trainee",
    appName: "INTERNet Trainee",
    idLabel: "Student ID or email",
    idPlaceholder: "e.g. 24-LN-0664",
    idHelp: "Your student number or the email on your account",
    idMode: "text",
    button: "Badge in",
    welcome: "Welcome back",
    wrong: "That student ID and password don’t match. Check them or reset your password.",
  },
  supervisor: {
    name: "Supervisor",
    article: "a supervisor",
    appName: "INTERNet Supervisor",
    idLabel: "Work email",
    idPlaceholder: "name@company.com",
    idHelp: "The email the OJT coordinator registered for you",
    idMode: "email",
    button: "Sign in",
    welcome: "Welcome back",
    wrong: "That email and password don’t match. Check them or reset your password.",
  },
  coordinator: {
    name: "Coordinator",
    article: "a coordinator",
    appName: "INTERNet Coordinator",
    idLabel: "Coordinator email",
    idPlaceholder: "name@psu.edu.ph",
    idHelp: "Your PSU coordinator account",
    idMode: "email",
    button: "Sign in to the console",
    welcome: "Welcome back",
    wrong: "That email and password don’t match. Check them or reset your password.",
  },
};

const LAST_ROLE_KEY = "inb_last_role";

const isRole = (value: unknown): value is Role => DOOR_ROLES.includes(value as Role);

/** The door used last on this device; the trainee's when none. */
export function lastDoorRole(): Role {
  try {
    const stored = localStorage.getItem(LAST_ROLE_KEY);
    return isRole(stored) ? stored : "student";
  } catch {
    return "student";
  }
}

export function rememberDoorRole(role: Role): void {
  try {
    localStorage.setItem(LAST_ROLE_KEY, role);
  } catch {
    /* private mode: "/" opens the trainee's door next time */
  }
}

/** The role already signed in on this device, if its token is still stored. */
export function signedInRole(): Role | null {
  try {
    const active = localStorage.getItem("active_role");
    return isRole(active) && localStorage.getItem(`${active}_token`) ? active : null;
  } catch {
    return null;
  }
}

/** Where to go after signing out, or when a session ends: the role's own door. */
export function doorOf(role: string | null | undefined): string {
  return `/${isRole(role) ? role : lastDoorRole()}/sign-in`;
}
