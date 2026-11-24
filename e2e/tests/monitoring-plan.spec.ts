import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";
import { api, apiSession, signIn } from "./helpers";

/*
|--------------------------------------------------------------------------
| THE MONITORING PLAN (Phase 2.3)
|--------------------------------------------------------------------------
|
| On Monitoring, the coordinator plans a call to a made-up company for
| today, sees it under Planned this week, exports the plan as a PDF, and
| marks it done with findings; it then shows in the visit log. The company
| is marked inactive at the end.
|
*/

const axeSource = createRequire(__filename).resolve("axe-core/axe.min.js");
const stamp = Date.now().toString(36);
const companyName = `Made Up Planned Office ${stamp}`;
let companyId = 0;

async function expectAccessible(page: Page, where: string) {
  await page.addScriptTag({ path: axeSource });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: Document, options: unknown) => Promise<{ violations: { id: string; impact: string; nodes: unknown[] }[] }> } }).axe;
    const result = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return result.violations.filter((item) => item.impact === "serious" || item.impact === "critical").map((item) => `${item.id} (${item.nodes.length})`);
  });
  expect(violations, `${where}: serious or critical axe violations`).toEqual([]);
}

test.beforeAll(async () => {
  const coordinator = await apiSession("coordinator");
  const made = await api<{ company: { id: number } }>(coordinator.token, "POST", "/api/coordinator/company-records", { name: companyName, hte_type: "government" });
  expect(made.status).toBe(201);
  companyId = made.body.company.id;
});

test.afterAll(async () => {
  const coordinator = await apiSession("coordinator");
  await api(coordinator.token, "PATCH", `/api/coordinator/company-records/${companyId}/status`, { is_active: false });
});

test("the coordinator plans a call, exports the plan, and marks it done", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "coordinator");
  await page.goto("/coordinator/monitoring");
  const card = page.getByRole("main").locator("section").filter({ has: page.getByRole("heading", { name: "Monitoring plan" }) }).first();
  await expect(card).toBeVisible({ timeout: 20_000 });

  await card.getByRole("button", { name: "Plan a check-in" }).click();
  const dialog = page.getByRole("dialog", { name: "Plan a check-in" });
  await dialog.getByLabel("Company").selectOption({ label: companyName });
  await dialog.getByLabel("Kind").selectOption({ label: "Call" });
  await dialog.getByLabel(/What to look at/).fill("Ask how the first week went.");
  await dialog.getByRole("button", { name: "Plan it" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Check-in planned.")).toBeVisible();

  const row = card.getByRole("listitem").filter({ hasText: companyName });
  await expect(row).toContainText("Whole company. Ask how the first week went.");
  await expect(row.getByText("Call", { exact: true })).toBeVisible();

  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(wide, "Monitoring scrolls sideways at 390 px").toBeLessThanOrEqual(1);
  await expectAccessible(page, "Monitoring with the plan");

  const download = page.waitForEvent("download");
  await card.getByRole("button", { name: "Export the plan" }).click();
  expect((await download).suggestedFilename()).toBe("internet-monitoring-plan.pdf");

  await row.getByRole("button", { name: /^Mark done/ }).click();
  const done = page.getByRole("dialog", { name: `Mark done: ${companyName}` });
  await done.getByLabel("What you found").fill("The trainee is settled and has a desk.");
  await done.getByRole("button", { name: "Mark done" }).click();
  await expect(done).toBeHidden();
  await expect(page.getByText("Marked done. It is in the visit log.")).toBeVisible();
  await expect(card.getByRole("listitem").filter({ hasText: companyName })).toHaveCount(0);

  await page.goto("/coordinator/site-visits");
  await expect(page.getByText("The trainee is settled and has a desk.")).toBeVisible({ timeout: 20_000 });
});
