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

/** The second demo intern of the same supervisor, for things done for several interns at once. */
export const SECOND_STUDENT = {
  ...ACCOUNTS.student,
  email: "student2.demo@internet.test",
  name: "Demo Student Two",
};

/** Signs in through the real sign-in page. */
export async function signIn(page: Page, role: Role, account = ACCOUNTS[role]): Promise<void> {
  // Iteration 23: each role signs in at its own door.
  await page.goto(`/${role}/sign-in`);
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

/*
| Iteration 18: a time-in opens 30 minutes before the shift, and with no
| time-in by the lunch start the day waits for the afternoon window. The
| journeys run at whatever hour CI does, so a journey that times in either
| checks the window first or gives its own student a shift around now.
*/

type DayPlan = { opensAt: string | null; pmCutoff: string | null; pmOpensAt: string | null } | null;

/** True when today's time-in window is closed for this student right now (the server's own times). */
export async function timeInClosed(token: string, studentId: string): Promise<boolean> {
  const plan = (await api<{ today?: DayPlan }>(token, "GET", `/api/attendance/${encodeURIComponent(studentId)}`)).body.today ?? null;
  if (!plan) return false;
  const now = Date.now();
  if (plan.opensAt && now < Date.parse(plan.opensAt)) return true;
  if (plan.pmCutoff && plan.pmOpensAt && now >= Date.parse(plan.pmCutoff) && now < Date.parse(plan.pmOpensAt)) return true;
  return false;
}

/** A shift that is open for a time-in now and has no lunch: the morning until 11:59, or the afternoon from 12:00. */
export function shiftAroundNow(): { start_time: string; end_time: string } {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  return hour < 12 ? { start_time: "00:00", end_time: "11:59" } : { start_time: "12:00", end_time: "23:59" };
}

/** Iteration 21: on a phone, Profile's groups open in a sheet; on a wider screen they are all on the page. */
export async function openProfileGroup(page: Page, title: string): Promise<void> {
  if ((page.viewportSize()?.width ?? 1280) >= 768) return;
  const row = page.getByRole("list", { name: "Profile" }).getByRole("button", { name: new RegExp(`^${title}`) });
  await row.waitFor();
  await row.click();
  await page.getByRole("dialog", { name: title }).waitFor();
}
