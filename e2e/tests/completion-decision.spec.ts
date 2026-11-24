import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, API, api, apiSession, signIn } from "./helpers";

/*
|--------------------------------------------------------------------------
| THE COORDINATOR APPROVES OR RETURNS A COMPLETION REVIEW (Phase 2.5)
|--------------------------------------------------------------------------
|
| A made-up trainee has asked for a completion review (set in the database:
| finishing a whole checklist here would test other things). The
| coordinator returns it with a note, which the trainee sees on their
| checklist; once asked again, the coordinator approves it.
|
| Needs DATABASE_PUBLIC_URL, as the API has (CI sets it).
|
*/

const axeSource = createRequire(__filename).resolve("axe-core/axe.min.js");
const backend = path.resolve(__dirname, "..", "..", "backend");
const stamp = Date.now().toString(36);
const studentId = `CDE-${stamp}`.toUpperCase();
const email = `${studentId.toLowerCase()}@demo.invalid`;
const password = "FinishCheck4567!";

/** Marks the made-up trainee as having asked for a completion review. */
const askForReview = () =>
  execFileSync(
    process.execPath,
    [
      "-e",
      `const { Pool } = require("pg");
       const pool = new Pool({ connectionString: process.env.DATABASE_PUBLIC_URL });
       pool.query("UPDATE students SET completion_requested_at = NOW() WHERE student_id = $1", [process.argv[1]]).then(() => pool.end());`,
      studentId,
    ],
    { cwd: backend, env: process.env, encoding: "utf8" }
  );

async function expectAccessible(page: Page, where: string) {
  await page.addScriptTag({ path: axeSource });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: Document, options: unknown) => Promise<{ violations: { id: string; impact: string; nodes: unknown[] }[] }> } }).axe;
    const result = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return result.violations.filter((item) => item.impact === "serious" || item.impact === "critical").map((item) => `${item.id} (${item.nodes.length})`);
  });
  expect(violations, `${where}: serious or critical axe violations`).toEqual([]);
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const coordinator = await apiSession("coordinator");
  const made = await api(coordinator.token, "POST", "/api/coordinator/students", { student_id: studentId, email, password: "FinishStart123!", name: "Made Up Finisher" });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const first = await (await fetch(`${API}/api/login/student`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "FinishStart123!" }) })).json();
  expect((await api(first.token, "PUT", `/api/students/${studentId}/password`, { current_password: "FinishStart123!", new_password: password })).status).toBe(200);
  const student = await (await fetch(`${API}/api/login/student`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) })).json();
  const privacy = await api<{ notice: { version: string } }>(student.token, "GET", `/api/students/${studentId}/privacy`);
  expect((await api(student.token, "POST", `/api/students/${studentId}/privacy/consent`, { version: privacy.body.notice.version })).status).toBe(200);
  askForReview();
});

test.afterAll(async () => {
  const coordinator = await apiSession("coordinator");
  await api(coordinator.token, "PATCH", `/api/coordinator/students/${studentId}/status`, { is_active: false });
});

test("the coordinator returns the review with a note, and the trainee sees it", async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "coordinator");
  await page.goto(`/coordinator/students/${studentId}`);
  const card = page.getByRole("main").locator("section").filter({ has: page.getByRole("heading", { name: "Completion review" }) }).first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expectAccessible(page, "The record with the completion review");
  await card.getByRole("button", { name: "Return it" }).click();
  const dialog = page.getByRole("dialog", { name: "Return Made Up Finisher's completion review?" });
  await dialog.getByLabel("What to fix").fill("Upload the signed endorsement letter again.");
  await dialog.getByRole("button", { name: "Return it" }).click();
  await expect(page.getByText("Returned to the student with your note.")).toBeVisible();
  await expect(card).toBeHidden();

  const traineePage = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await signIn(traineePage, "student", { ...ACCOUNTS.student, email, password });
  await traineePage.goto("/student/completion");
  await expect(traineePage.getByText(/Your coordinator returned your review on .*: Upload the signed endorsement letter again\. Fix it, then ask again\./)).toBeVisible({ timeout: 20_000 });
  await traineePage.context().close();
});

test("asked again, the coordinator approves it", async ({ page }) => {
  askForReview();
  await signIn(page, "coordinator");
  await page.goto(`/coordinator/students/${studentId}`);
  const card = page.getByRole("main").locator("section").filter({ has: page.getByRole("heading", { name: "Completion review" }) }).first();
  await card.getByRole("button", { name: "Approve completion" }).click();
  await page.getByRole("dialog", { name: "Approve Made Up Finisher's completion?" }).getByRole("button", { name: "Approve completion" }).click();
  await expect(page.getByText("Completion approved. The student has been told.")).toBeVisible();
  await expect(page.getByText(/^Completion approved \w/).first()).toBeVisible();
  await expect(card.getByRole("button", { name: "Take back and return" })).toBeVisible();
});
