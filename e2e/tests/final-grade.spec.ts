import { expect, test, type Page } from "@playwright/test";
import { api, apiSession, signIn, expectAccessible } from "./helpers";

/*
|--------------------------------------------------------------------------
| THE GRADE SHEET AND THE INSTRUCTOR'S EVALUATION (Phase 1.5)
|--------------------------------------------------------------------------
|
| The coordinator's Evaluations page has a grade sheet (HTE, instructor,
| final) for the students the filters leave. The instructor's form starts
| from the records' suggestions and shows the grade now and after. The
| student's record shows the breakdown; the student sees no final grade
| until it is released (the release itself is in the API tests).
|
*/



test("the coordinator gives the instructor's scores from the grade sheet, and the record shows the breakdown", async ({ page }) => {
  const student = await apiSession("student");
  const coordinator = await apiSession("coordinator");
  const breakdown = await api<{ grade: { name: string; released_at: string | null } }>(coordinator.token, "GET", `/api/coordinator/students/${encodeURIComponent(student.id)}/final-grade`);
  expect(breakdown.status).toBe(200);
  const name = breakdown.body.grade.name;

  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, "coordinator");
  await page.goto("/coordinator/evaluations");
  const sheet = page.locator("section, div").filter({ has: page.getByRole("heading", { name: "Grade sheet" }) }).last();
  await expect(sheet.getByText(/Final grade: HTE \d+%, instructor \d+%/)).toBeVisible();
  await page.getByRole("button", { name: new RegExp(`^(Evaluate|Edit scores) for ${name} \\(${student.id}\\)$`) }).first().click();

  const dialog = page.getByRole("dialog", { name: `Instructor evaluation of ${name}` });
  await expect(dialog.getByLabel(/^Logs \(\d+%\)$/)).toBeVisible();
  await dialog.getByLabel(/^Logs/).fill("88");
  await dialog.getByLabel(/^Punctuality/).fill("90");
  await dialog.getByLabel(/^Preparation/).fill("85");
  await dialog.getByLabel(/^Conduct/).fill("92");
  // 25 each unless the term says otherwise: 88.75.
  await expect(dialog.getByText("After saving").locator("..")).toContainText(/\d+\.\d\d/);
  await dialog.getByRole("button", { name: "Save the evaluation" }).click();
  await expect(page.getByText(/Instructor evaluation (saved|updated)\./)).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: student.id });
  await expect(row).toContainText(/Waiting for HTE|Final|Released|Changed since release/);

  // The student's record: the breakdown on the Evaluations tab.
  await page.goto(`/coordinator/students/${encodeURIComponent(student.id)}?tab=evaluations`);
  await expect(page.getByRole("heading", { name: "Final grade" })).toBeVisible();
  await expect(page.getByText(/^Instructor \(\d+%\)$/)).toBeVisible();
});

test("on a phone the grade sheet stays inside the page and is axe clean", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "coordinator");
  await page.goto("/coordinator/evaluations");
  await expect(page.getByRole("heading", { name: "Grade sheet" })).toBeVisible();
  await expect(page.locator(".animate-skeleton")).toHaveCount(0, { timeout: 15_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);
  await expectAccessible(page, "/coordinator/evaluations at 390 px");
});

test("the student sees no final grade until it is released", async ({ page }) => {
  const student = await apiSession("student");
  const own = await api<{ released: boolean }>(student.token, "GET", `/api/students/${encodeURIComponent(student.id)}/final-grade`);
  expect(own.status).toBe(200);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "student");
  await page.goto("/student/resolution?tab=evaluation");
  await expect(page.getByRole("tab", { name: /Your (feedback )?form/ })).toBeVisible();
  if (own.body.released) await expect(page.getByRole("heading", { name: "Your final OJT grade" })).toBeVisible();
  else await expect(page.getByRole("heading", { name: "Your final OJT grade" })).toHaveCount(0);
});
