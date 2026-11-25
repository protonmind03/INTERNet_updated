import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, API, api, apiSession, signIn, expectAccessible } from "./helpers";

/*
|--------------------------------------------------------------------------
| STUDENTS CHOOSE THEIR AGENCY; THE COORDINATOR ASSIGNS (Phase 2.2)
|--------------------------------------------------------------------------
|
| In a made-up term, the coordinator opens a choice window on Companies; a
| made-up trainee ranks two made-up agencies on their schedule page; the
| coordinator sees the demand and assigns the first choice, and the trainee
| has it. The term is closed and the companies marked inactive at the end.
|
*/

const stamp = Date.now().toString(36);
const termName = `Choice term ${stamp}`;
const firstName = `Made Up First Choice ${stamp}`;
const secondName = `Made Up Second Choice ${stamp}`;
const studentId = `CHE-${stamp}`.toUpperCase();
const email = `${studentId.toLowerCase()}@demo.invalid`;
const password = "ChoiceCheck4567!";
let termId = 0;
const companyIds: number[] = [];

async function noSidewaysScroll(page: Page, where: string) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(wide, `${where} scrolls sideways at 390 px`).toBeLessThanOrEqual(1);
}

/** A datetime-local value, days from now, in this machine's time. */
function localInput(days: number) {
  const date = new Date(Date.now() + days * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const coordinator = await apiSession("coordinator");
  const academics = await api<{ programs: { id: number; is_active: boolean }[] }>(coordinator.token, "GET", "/api/coordinator/academics");
  const program = academics.body.programs.find((item) => item.is_active);
  expect(program, "an active program").toBeTruthy();
  const start = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
  const term = await api<{ term: { id: number } }>(coordinator.token, "POST", "/api/coordinator/terms", { name: termName, start_date: start, end_date: end });
  expect(term.status, JSON.stringify(term.body)).toBe(201);
  termId = term.body.term.id;
  for (const name of [firstName, secondName]) {
    const made = await api<{ company: { id: number } }>(coordinator.token, "POST", "/api/coordinator/company-records", { name, hte_type: "government", slots: 3 });
    expect(made.status).toBe(201);
    companyIds.push(made.body.company.id);
  }
  const made = await api(coordinator.token, "POST", "/api/coordinator/students", { student_id: studentId, email, password: "ChoiceStart123!", name: "Made Up Chooser", program_id: program!.id });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  expect((await api(coordinator.token, "POST", `/api/coordinator/terms/${termId}/students`, { student_ids: [studentId] })).status).toBe(200);
  const first = await (await fetch(`${API}/api/login/student`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "ChoiceStart123!" }) })).json();
  expect((await api(first.token, "PUT", `/api/students/${studentId}/password`, { current_password: "ChoiceStart123!", new_password: password })).status).toBe(200);
  const signedIn = await (await fetch(`${API}/api/login/student`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) })).json();
  const privacy = await api<{ notice: { version: string } }>(signedIn.token, "GET", `/api/students/${studentId}/privacy`);
  expect((await api(signedIn.token, "POST", `/api/students/${studentId}/privacy/consent`, { version: privacy.body.notice.version })).status).toBe(200);
});

test.afterAll(async () => {
  const coordinator = await apiSession("coordinator");
  await api(coordinator.token, "PATCH", `/api/coordinator/students/${studentId}/status`, { is_active: false });
  for (const id of companyIds) await api(coordinator.token, "PATCH", `/api/coordinator/company-records/${id}/status`, { is_active: false });
  if (termId) {
    await api(coordinator.token, "PUT", `/api/coordinator/terms/${termId}/choice-window`, { opens_at: null, closes_at: null });
    await api(coordinator.token, "POST", `/api/coordinator/terms/${termId}/close`, {});
  }
});

test("the coordinator opens a choice window for the term", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "coordinator");
  await page.goto("/coordinator/companies");
  const section = page.getByRole("main").locator("section").filter({ has: page.getByRole("heading", { name: "Agency choices" }) }).first();
  await expect(section).toBeVisible({ timeout: 20_000 });
  await section.getByLabel("Term").selectOption({ label: termName });
  await expect(section.getByText("No choice window")).toBeVisible();
  await section.getByRole("button", { name: "Open a choice window" }).click();
  const dialog = page.getByRole("dialog", { name: "Choice window" });
  await dialog.getByLabel("Opens").fill(localInput(-1));
  await dialog.getByLabel("Closes").fill(localInput(7));
  await dialog.getByRole("button", { name: "Save the window" }).click();
  await expect(dialog).toBeHidden();
  await expect(section.getByText("Open", { exact: true })).toBeVisible();
  await noSidewaysScroll(page, "Companies");
  await expectAccessible(page, "Companies with agency choices");
});

test("the trainee ranks two agencies on their schedule page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "student", { ...ACCOUNTS.student, email, password });
  await page.goto("/schedule");
  const block = page.getByRole("region", { name: "Choose your agency" });
  await expect(block).toBeVisible({ timeout: 20_000 });
  await block.getByLabel("First choice").selectOption({ label: `${firstName}, 3 slots free` });
  await block.getByLabel(/Second choice/).selectOption({ label: `${secondName}, 3 slots free` });
  await block.getByRole("button", { name: "Save my choices" }).click();
  await expect(page.getByText("Your choices are saved. Your coordinator assigns you.")).toBeVisible();
  await noSidewaysScroll(page, "Schedule");
  await expectAccessible(page, "Schedule with agency choices");
});

test("the coordinator sees the demand and assigns the first choice", async ({ page }) => {
  await signIn(page, "coordinator");
  await page.goto("/coordinator/companies");
  const section = page.getByRole("main").locator("section").filter({ has: page.getByRole("heading", { name: "Agency choices" }) }).first();
  await expect(section).toBeVisible({ timeout: 20_000 });
  await section.getByLabel("Term").selectOption({ label: termName });
  await expect(section.getByText(`${firstName}`).first()).toBeVisible();
  await expect(section.getByText("1 first, 1 in all, 0 of 3 slots filled")).toBeVisible();
  // The hidden words are their own box, so the name may have a space before the colon.
  await section.getByRole("button", { name: new RegExp(`^1\\. ${firstName}\\s*: assign Made Up Chooser here$`) }).click();
  const dialog = page.getByRole("dialog", { name: `Assign Made Up Chooser to ${firstName}?` });
  await dialog.getByRole("button", { name: "Assign" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(`Assigned to ${firstName}. The student has been told.`)).toBeVisible();

  const student = await (await fetch(`${API}/api/login/student`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) })).json();
  const mine = await api<{ assigned: string | null }>(student.token, "GET", `/api/students/${studentId}/company-choices`);
  expect(mine.body.assigned).toBe(firstName);
});
