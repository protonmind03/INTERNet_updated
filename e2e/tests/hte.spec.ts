import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";
import { api, apiSession, signIn } from "./helpers";

/*
|--------------------------------------------------------------------------
| HOST TRAINING ESTABLISHMENTS (Phase 1.3)
|--------------------------------------------------------------------------
|
| A made-up private company is put into screening; approving it is refused
| until a screening that passed is recorded on its page; the MOA is
| uploaded there. A trainee suggests an agency from their Host company
| card, and the coordinator declines it with a note. The company is marked
| inactive at the end, so the other journeys never pick it.
|
*/

const axeSource = createRequire(__filename).resolve("axe-core/axe.min.js");
const stamp = Date.now().toString(36);
const companyName = `Made Up Screening Co ${stamp}`;
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

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const coordinator = await apiSession("coordinator");
  const made = await api<{ company: { id: number; version: number } }>(coordinator.token, "POST", "/api/coordinator/company-records", { name: companyName, hte_type: "private", slots: 2 });
  expect(made.status).toBe(201);
  companyId = made.body.company.id;
  const screening = await api(coordinator.token, "PUT", `/api/coordinator/company-records/${companyId}/hte-status`, { status: "screening", expected_version: made.body.company.version });
  expect(screening.status).toBe(200);
});

test.afterAll(async () => {
  const coordinator = await apiSession("coordinator");
  await api(coordinator.token, "PATCH", `/api/coordinator/company-records/${companyId}/status`, { is_active: false });
});

test("a private company is approved only after a passed screening, recorded on its page, and its MOA is kept there", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, "coordinator");
  await page.goto(`/coordinator/companies/${companyId}`);
  await expect(page.getByRole("heading", { name: "Approval and agreement" })).toBeVisible();
  const approval = page.locator("main");
  await expect(approval.getByText("Screening", { exact: true })).toBeVisible();
  await expect(approval.getByText("Private", { exact: true })).toBeVisible();

  // Approving before any screening: refused, and the page says why.
  await approval.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("dialog", { name: /Make .* approved\?/ }).getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/its latest screening must have passed before it is approved/)).toBeVisible();

  // The screening, then the approval.
  await page.getByRole("button", { name: "Record a screening" }).click();
  const dialog = page.getByRole("dialog", { name: "Record a screening" });
  for (const label of ["Standing", "Work environment", "Space and capacity", "Safety"]) {
    await dialog.getByLabel(label, { exact: true }).selectOption("4");
  }
  await dialog.getByRole("button", { name: "Record the screening" }).click();
  await expect(page.getByText("Screening recorded.")).toBeVisible();
  await expect(page.getByText("Passed", { exact: true })).toBeVisible();
  await approval.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("dialog", { name: /Make .* approved\?/ }).getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/is approved\. Students can be placed there\./)).toBeVisible();
  await expect(approval.getByText("Approved", { exact: true })).toBeVisible();

  // The signed MOA.
  await page.getByLabel("Signed agreement file").setInputFiles({ name: "moa.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") });
  await expect(page.getByText("Agreement uploaded.")).toBeVisible();
  await expect(page.getByText(/Signed copy: moa\.pdf/)).toBeVisible();

  // On the list: its chips, and the MOA filter.
  await page.goto("/coordinator/companies");
  await page.getByRole("searchbox", { name: "Search companies" }).fill(companyName);
  await page.getByRole("combobox", { name: "Agreement" }).selectOption("not_notarized");
  const row = page.getByRole("row").filter({ hasText: companyName });
  await expect(row.getByText("Approved", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Agreement" }).selectOption("missing");
  await expect(page.getByRole("row").filter({ hasText: companyName })).toHaveCount(0);
});

test("a trainee suggests an agency, and the coordinator declines it with a note", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "student");
  await page.goto("/schedule");
  await page.getByRole("button", { name: "Suggest an agency" }).click();
  const dialog = page.getByRole("dialog", { name: "Suggest an agency" });
  const agency = `Made Up Agency ${stamp}`;
  await dialog.getByLabel("Agency or company name").fill(agency);
  await dialog.getByLabel("Why it would be a good place").fill("My cousin interned there and learned a lot.");
  await dialog.getByRole("button", { name: "Send the suggestion" }).click();
  await expect(page.getByText(/Suggestion sent/)).toBeVisible();
  await expect(page.getByText(agency)).toBeVisible();

  const coordinator = await apiSession("coordinator");
  const listed = await api<{ requests: { id: number; company_name: string; version: number }[] }>(coordinator.token, "GET", "/api/coordinator/company-requests");
  const request = listed.body.requests.find((item) => item.company_name === agency)!;
  expect(request).toBeTruthy();
  const declined = await api(coordinator.token, "PUT", `/api/coordinator/company-requests/${request.id}/decision`, { decision: "reject", note: "Not taking interns this term.", expected_version: request.version });
  expect(declined.status).toBe(200);
  await page.reload();
  await expect(page.getByText("Declined", { exact: true }).first()).toBeVisible();
});

test("on a phone the company page fits the screen and is axe clean", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "coordinator");
  await page.goto(`/coordinator/companies/${companyId}`);
  await expect(page.getByRole("heading", { name: "Approval and agreement" })).toBeVisible();
  await expect(page.locator(".animate-skeleton")).toHaveCount(0, { timeout: 15_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expectAccessible(page, "company page at 390 px");
});
