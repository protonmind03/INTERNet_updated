import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/*
|--------------------------------------------------------------------------
| THE OJT DIRECTOR'S PORTAL (Phase 1.6)
|--------------------------------------------------------------------------
|
| A Director account is made for the run with the backend's own script
| (npm run director:create) and deactivated again at the end: while an
| active Director exists the coordinators lose the office's powers, which
| the other journeys use. Every page is opened at 390 px and 1280 px and
| checked with axe (WCAG 2.1 A and AA; serious or critical fails).
|
| Needs DATABASE_PUBLIC_URL for the script, as the API has (CI sets it).
|
*/

const backend = path.resolve(__dirname, "..", "..", "backend");
const script = (...args: string[]) =>
  execFileSync(process.execPath, [path.join(backend, "node_modules/tsx/dist/cli.mjs"), path.join(backend, "src/scripts/create-director.ts"), ...args], {
    cwd: backend,
    env: process.env,
    encoding: "utf8",
  });
// axe-core comes with the e2e packages (a dependency of lighthouse).
const axeSource = createRequire(__filename).resolve("axe-core/axe.min.js");

const email = `e2e.director.${Date.now().toString(36)}@demo.invalid`;
let password = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  const printed = script("--email", email, "--name", "Esperanza Director");
  password = /Temporary password[^:]*: (\S+)/.exec(printed)?.[1] ?? "";
  expect(password, "the script prints a temporary password").not.toBe("");
});

test.afterAll(() => {
  script("--email", email, "--deactivate");
});

async function signInAsDirector(page: Page) {
  await page.goto("/director/sign-in");
  await page.locator("#inb-login-id").fill(email);
  await page.locator("#inb-login-pw").fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/director\/overview$/, { timeout: 20_000 });
}

async function expectAccessible(page: Page, where: string) {
  // A dialog still fading out (or a part fading in) dims the text under it, and axe reads that as
  // low contrast: on a slow machine (CI) the check came before the fade ended. Wait for every
  // finite animation to end; endless ones (a spinner) are left.
  await page.waitForFunction(
    () => document.getAnimations().every((animation) => animation.playState !== "running" || animation.effect?.getComputedTiming().iterations === Infinity),
    null,
    { timeout: 10_000 }
  );
  await page.addScriptTag({ path: axeSource });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: Document, options: unknown) => Promise<{ violations: { id: string; impact: string; nodes: { target: unknown[]; html: string; failureSummary?: string }[] }[] }> } }).axe;
    const result = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return result.violations.filter((item) => item.impact === "serious" || item.impact === "critical").map((item) => `${item.id} (${item.nodes.length}): ${item.nodes.map((node) => `${node.target.join(" ")} ${node.html.slice(0, 160)} ${(node.failureSummary ?? "").replace(/\s+/g, " ").slice(0, 300)}`).join(" | ")}`);
  });
  expect(violations, `${where}: serious or critical axe violations`).toEqual([]);
}

const PAGES: [string, string][] = [
  ["/director/overview", "Overview"],
  ["/director/students", "Students"],
  ["/director/approvals", "Approvals"],
  ["/director/programs", "Programs"],
  ["/director/coordinators", "Coordinators"],
  ["/director/rules", "Rules"],
  ["/director/reports", "Reports"],
  ["/director/notifications", "Notifications"],
  ["/director/profile", "Profile"],
  ["/director/help", "Help"],
];

for (const [width, height] of [[1280, 900], [390, 844]] as const) {
  test(`at ${width} px: every page opens, fits the screen and is axe clean`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await signInAsDirector(page);
    if (width >= 768) {
      const menu = page.locator("aside.role-side");
      await expect(menu.getByRole("link", { name: "Overview", exact: true })).toHaveAttribute("aria-current", "page");
      await menu.getByRole("link", { name: "Coordinators", exact: true }).click();
      await expect(page).toHaveURL(/\/director\/coordinators$/);
    } else {
      const dock = page.locator("nav.role-dock");
      await dock.getByRole("link", { name: "Coordinators" }).click();
      await expect(page).toHaveURL(/\/director\/coordinators$/);
    }
    for (const [address, title] of PAGES) {
      await page.goto(address);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.locator(".animate-skeleton")).toHaveCount(0, { timeout: 15_000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${address} scrolls sideways`).toBeLessThanOrEqual(0);
      await expectAccessible(page, `${address} at ${width} px`);
    }
  });
}

test("the college marks scope the overview, and the choice is in the address", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsDirector(page);
  const marks = page.getByRole("radiogroup", { name: "College" });
  await expect(marks.getByRole("radio", { name: /All colleges/ })).toHaveAttribute("aria-checked", "true");
  await marks.getByRole("radio", { name: /CCS/ }).click();
  await expect(page).toHaveURL(/college=\d+/);
  // On a phone each college is a short block: only CCS's is left.
  await expect(page.getByRole("listitem").filter({ hasText: "College of Computing Sciences" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("listitem").filter({ hasText: "College of Arts, Sciences, and Letters" })).toHaveCount(0);
  // The marks scroll inside their own box; the page does not.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await marks.getByRole("radio", { name: /All colleges/ }).click();
  await expect(page).not.toHaveURL(/college=/);
});

test("a coordinator's colleges are chosen with the value now and after shown before saving", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAsDirector(page);
  await page.goto("/director/coordinators");
  const row = page.getByRole("listitem").filter({ hasText: "coordinator.demo@internet.test" });
  await expect(row.getByText("Looks after: Every student")).toBeVisible();
  await row.getByRole("button", { name: /Colleges and programs/ }).click();
  const dialog = page.getByRole("dialog", { name: /What .* looks after/ });
  await dialog.getByRole("checkbox", { name: "College of Computing Sciences" }).check();
  await expect(dialog.getByText("Every student", { exact: true })).toBeVisible();
  await expect(dialog.getByText("CCS", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Save colleges and programs" }).click();
  await expect(row.getByText("Looks after: CCS")).toBeVisible();
  // Back to every student, so the other journeys see what they expect.
  await row.getByRole("button", { name: /Colleges and programs/ }).click();
  await dialog.getByRole("checkbox", { name: "College of Computing Sciences" }).uncheck();
  await dialog.getByRole("button", { name: "Save colleges and programs" }).click();
  await expect(row.getByText("Looks after: Every student")).toBeVisible();
});

test("Approvals: an agency's change and a section's release say the value now and after; each part is axe clean", async ({ page }) => {
  await signInAsDirector(page);
  for (const [width, height] of [[1280, 900], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/director/approvals");
    const parts = page.getByRole("tablist", { name: "What to decide" });
    await expect(parts.getByRole("tab", { name: "Agencies" })).toHaveAttribute("aria-selected", "true");

    // A seeded government agency is approved: its one action is Suspend, said before it is done.
    const agency = page.getByRole("listitem").filter({ hasText: "Provincial Government of Pangasinan" });
    await expect(agency.getByText("Approved", { exact: true })).toBeVisible({ timeout: 15_000 });
    await agency.getByRole("button", { name: /^Suspend/ }).click();
    const dialog = page.getByRole("dialog", { name: "Suspend Provincial Government of Pangasinan?" });
    await expect(dialog.getByText(/Now: Approved\. After: Suspended\. No new student can be placed there/)).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".animate-skeleton")).toHaveCount(0, { timeout: 15_000 });
    await expectAccessible(page, `Approvals, agencies, at ${width} px`);

    await parts.getByRole("tab", { name: "Grades" }).click();
    await expect(page).toHaveURL(/part=grades/);
    await expect(page.getByText(/Final grade: HTE \d+%, instructor \d+%/)).toBeVisible();
    await expect(page.locator(".animate-skeleton")).toHaveCount(0, { timeout: 15_000 });
    // Every section either offers its release or says why not.
    // The table on a computer, the list on a phone: the one that is shown.
    const release = page.getByRole("button", { name: /^Release grades for / }).filter({ visible: true }).first();
    if (await release.isVisible()) {
      const name = ((await release.textContent()) ?? "").replace("Release grades for ", "").trim();
      await release.click();
      const confirm = page.getByRole("dialog", { name: `Release grades for ${name}?` });
      await expect(confirm.getByText(/^Now: \d+ of \d+ students? released\. After: \d+ of \d+\./)).toBeVisible();
      await confirm.getByRole("button", { name: "Cancel" }).click();
      await expect(confirm).toHaveCount(0);
    }
    await expectAccessible(page, `Approvals, grades, at ${width} px`);

    await parts.getByRole("tab", { name: "Cleared anyway" }).click();
    await expect(page).toHaveURL(/part=overrides/);
    await expect(page.locator(".animate-skeleton")).toHaveCount(0, { timeout: 15_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "Approvals scrolls sideways").toBeLessThanOrEqual(0);
    await expectAccessible(page, `Approvals, cleared anyway, at ${width} px`);
  }
});
