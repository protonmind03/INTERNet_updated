import { expect, test } from "@playwright/test";
import { api, apiSession, signIn, expectAccessible } from "./helpers";

/*
|--------------------------------------------------------------------------
| SEMESTERS, AND OJT THAT SPANS TWO TERMS (Phase 2.6)
|--------------------------------------------------------------------------
|
| A made-up program's OJT is set to run first semester, then second, on
| Programs. A made-up first-semester term is added with its semester and
| academic year in the term dialog; a second-semester term already exists.
| Terms then says a student continues into the second semester, and
| carries them over. The terms are closed and the program and student
| deactivated at the end.
|
*/

const stamp = Date.now().toString(36);
const programName = `Made Up Two Term Program ${stamp}`;
const firstTerm = `Made Up First ${stamp}`;
const secondTerm = `Made Up Second ${stamp}`;
const studentId = `SEM-${stamp}`.toUpperCase();
let programId = 0;
let secondId = 0;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const coordinator = await apiSession("coordinator");
  const academics = await api<{ colleges: { id: number }[] }>(coordinator.token, "GET", "/api/coordinator/academics");
  const made = await api<{ program: { id: number } }>(coordinator.token, "POST", "/api/coordinator/programs", {
    college_id: academics.body.colleges[0].id, name: programName, short_code: `TT${stamp}`.slice(0, 10).toUpperCase(),
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  programId = made.body.program.id;
  const second = await api<{ term: { id: number } }>(coordinator.token, "POST", "/api/coordinator/terms", {
    name: secondTerm, start_date: "2099-01-10", end_date: "2099-05-20", semester: "second", academic_year: "2098-2099",
  });
  expect(second.status, JSON.stringify(second.body)).toBe(201);
  secondId = second.body.term.id;
});

test.afterAll(async () => {
  const coordinator = await apiSession("coordinator");
  await api(coordinator.token, "PATCH", `/api/coordinator/students/${studentId}/status`, { is_active: false });
  const terms = await api<{ terms: { id: number; name: string }[] }>(coordinator.token, "GET", "/api/coordinator/terms");
  for (const term of terms.body.terms.filter((item) => item.name === firstTerm || item.name === secondTerm)) {
    await api(coordinator.token, "POST", `/api/coordinator/terms/${term.id}/close`, {});
  }
  if (programId) await api(coordinator.token, "PUT", `/api/coordinator/programs/${programId}`, { is_active: false });
});

test("the program's OJT runs first semester, then second", async ({ page }) => {
  await signIn(page, "coordinator");
  await page.goto("/coordinator/programs");
  const select = page.getByRole("combobox", { name: `OJT semesters of ${programName}` });
  await expect(select).toBeVisible({ timeout: 20_000 });
  await select.selectOption({ label: "First semester, then second semester" });
  await expect(page.getByText("OJT runs in the first semester, then continues in the second semester.")).toBeVisible();
  await expect(select).toHaveValue("first,second");
});

test("a first-semester term is added, and its continuing student is carried over", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "coordinator");
  await page.goto("/coordinator/terms");
  await page.getByRole("button", { name: "Add term" }).click();
  const dialog = page.getByRole("dialog", { name: "Add term" });
  await dialog.getByLabel("Term name").fill(firstTerm);
  await dialog.getByLabel("Starts").fill("2098-08-01");
  await dialog.getByLabel("Ends").fill("2098-12-15");
  await dialog.getByLabel(/Semester/).selectOption({ label: "First semester" });
  await dialog.getByLabel(/Academic year/).fill("2098-2099");
  await dialog.getByRole("button", { name: "Add term" }).click();
  await expect(dialog).toBeHidden();

  // A student of the program joins the first-semester term.
  const coordinator = await apiSession("coordinator");
  const terms = await api<{ terms: { id: number; name: string }[] }>(coordinator.token, "GET", "/api/coordinator/terms");
  const firstId = terms.body.terms.find((term) => term.name === firstTerm)!.id;
  const made = await api(coordinator.token, "POST", "/api/coordinator/students", {
    student_id: studentId, email: `${studentId.toLowerCase()}@demo.invalid`, password: "SemesterStart123!", name: "Made Up Continuer", program_id: programId,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  expect((await api(coordinator.token, "POST", `/api/coordinator/terms/${firstId}/students`, { student_ids: [studentId] })).status).toBe(200);

  await page.reload();
  const row = page.getByRole("listitem").filter({ hasText: firstTerm });
  await expect(row).toContainText("First semester 2098-2099");
  await expect(row).toContainText("1 student continues their OJT in the second semester: Made Up Continuer.");
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(wide, "Terms scrolls sideways at 390 px").toBeLessThanOrEqual(1);
  await expectAccessible(page, "Terms with a continuing student");

  await row.getByRole("button", { name: "Carry them over" }).click();
  const carry = page.getByRole("dialog", { name: "Carry the continuing students over?" });
  await expect(carry.getByLabel("Into the term")).toHaveValue(String(secondId));
  await carry.getByRole("button", { name: "Carry them over" }).click();
  await expect(page.getByText("1 student carried over, with their hours and records.")).toBeVisible();
  await expect(row).not.toContainText("continues their OJT");
});
