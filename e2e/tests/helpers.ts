import { expect, type Page } from "@playwright/test";

export const API = (process.env.E2E_API_URL || "http://127.0.0.1:5000").replace(/\/+$/, "");

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(API)) {
  throw new Error("End-to-end tests run only against this machine (E2E_API_URL must be localhost).");
}

export type Role = "student" | "supervisor" | "coordinator";

/** The demo accounts made by `npm run db:seed-demo`. */
export const ACCOUNTS: Record<Role, { email: string; password: string; tab: string; home: string }> = {
  student: {
    email: "student.demo@internet.test",
    password: "StudentDemo123!",
    tab: "Student",
    home: "/student/dashboard",
  },
  supervisor: {
    email: "supervisor.demo@internet.test",
    password: "SupervisorDemo123!",
    tab: "Supervisor",
    home: "/supervisor/dashboard",
  },
  coordinator: {
    email: "coordinator@internet.psu.edu.ph",
    password: "Coordinator123!",
    tab: "Coordinator",
    home: "/coordinator/dashboard",
  },
};

/** Signs in through the real sign-in page. */
export async function signIn(page: Page, role: Role): Promise<void> {
  const account = ACCOUNTS[role];
  await page.goto("/");
  await page.getByRole("group", { name: "Role" }).getByRole("button", { name: account.tab }).click();
  await page.locator("#inb-login-id").fill(account.email);
  await page.locator("#inb-login-pw").fill(account.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`${account.home}$`), { timeout: 20_000 });
}

/** A token for setting up or clearing records directly through the API. */
export async function apiSession(role: Role): Promise<{ token: string; id: string }> {
  const account = ACCOUNTS[role];
  const response = await fetch(`${API}/api/login/${role}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  if (!response.ok) throw new Error(`Could not sign in as the demo ${role} (${response.status}).`);
  const data = await response.json();
  return { token: data.token, id: String(data[role][`${role}_id`]) };
}

export async function api<T = Record<string, unknown>>(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json().catch(() => ({}))) as T };
}

/** Today in the Philippines, the zone every OJT date is kept in. */
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}
