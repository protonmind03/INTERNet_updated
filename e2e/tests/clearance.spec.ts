import { expect, test } from "@playwright/test";
import { api, apiSession, signIn } from "./helpers";

/*
|--------------------------------------------------------------------------
| THE CLEARANCE BOARD AND THE DEPLOYMENT GATE (Phase 1.2)
|--------------------------------------------------------------------------
|
| The coordinator sees each student's eligibility, the requirements needed
| before deployment and the company, and turns the gate on. With it on, a
| student who is not cleared sees a Requirements card on Today. The gate is
| always switched off again, so the other journeys can time in.
|
*/

const gateOff = async () => {
  const coordinator = await apiSession("coordinator");
  await api(coordinator.token, "PUT", "/api/coordinator/ojt-settings/deployment_gate_enabled", { value: false });
};

test.afterEach(gateOff);

test("the board lists what deployment needs; with the gate on, the student's Today says what is missing", async ({ page, browser }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, "coordinator");
  const menu = page.locator("aside.role-side");
  await menu.getByRole("button", { name: /^Decide/ }).click();
  await menu.getByRole("link", { name: "Clearance", exact: true }).click();
  await expect(page).toHaveURL(/\/coordinator\/clearance$/);
  await expect(page.getByRole("heading", { name: "Clearance", level: 1 })).toBeVisible();
  await expect(page.getByText("Deployment gate: off.")).toBeVisible();

  // The demo student's row: eligibility and the pack as chips.
  await page.getByLabel("Search students").fill("Demo Student");
  const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Demo Student", exact: true }) });
  await expect(row.getByText("Eligibility: Not checked")).toBeVisible();
  await expect(row.getByText("Chest X-ray: missing")).toBeVisible();
  await expect(row.getByRole("button", { name: "Clear anyway" })).toBeVisible();

  // Clear anyway asks for a reason first.
  await row.getByRole("button", { name: "Clear anyway" }).click();
  const override = page.getByRole("dialog", { name: "Clear Demo Student anyway?" });
  await override.getByRole("button", { name: "Clear anyway" }).click();
  await expect(override.getByText("Give a reason of at least 10 characters. It is kept in the audit log.")).toBeVisible();
  await override.getByRole("button", { name: "Cancel" }).click();

  // The gate, said plainly before it changes.
  await page.getByRole("button", { name: "Turn the gate on" }).click();
  const confirm = page.getByRole("dialog", { name: "Turn the deployment gate on?" });
  await expect(confirm.getByText(/Students who are not cleared will not be able to time in/)).toBeVisible();
  await confirm.getByRole("button", { name: "Turn the gate on" }).click();
  await expect(page.getByText("Deployment gate: on.")).toBeVisible();

  // The student's Today.
  const studentContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const student = await studentContext.newPage();
  try {
    await signIn(student, "student");
    const card = student.getByText("Requirements", { exact: true }).first();
    await expect(card).toBeVisible();
    await expect(student.getByText(/Still needed: .*Chest X-ray/).first()).toBeVisible();
    await expect(student.getByText("Needed before you can time in").first()).toBeVisible();
  } finally {
    await studentContext.close();
  }
});

test("on a phone the board fits the screen", async ({ page }) => {
  await signIn(page, "coordinator");
  await page.goto("/coordinator/clearance");
  await expect(page.getByRole("heading", { name: "Clearance", level: 1 })).toBeVisible();
  await expect(page.getByText("Deployment gate: off.")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
