import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "./helpers";

/*
|--------------------------------------------------------------------------
| THE SYSTEM ADMINISTRATOR'S PORTAL (Phase 1.7)
|--------------------------------------------------------------------------
|
| An administrator account is made for the run with the backend's own
| script (npm run admin:create) and deactivated again at the end: while an
| active administrator exists, the coordinators' System status is a single
| line, which the other journeys do not expect. Every page is opened at
| 390 px and 1280 px and checked with axe (WCAG 2.1 A and AA; serious or
| critical fails).
|
| Needs DATABASE_PUBLIC_URL for the script, as the API has (CI sets it).
|
*/

const backend = path.resolve(__dirname, "..", "..", "backend");
const script = (...args: string[]) =>
  execFileSync(process.execPath, [path.join(backend, "node_modules/tsx/dist/cli.mjs"), path.join(backend, "src/scripts/create-admin.ts"), ...args], {
    cwd: backend,
    env: process.env,
    encoding: "utf8",
  });

const email = `e2e.admin.${Date.now().toString(36)}@demo.invalid`;
let password = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  const printed = script("--email", email, "--name", "Ramon Sysadmin");
  password = /Temporary password[^:]*: (\S+)/.exec(printed)?.[1] ?? "";
  expect(password, "the script prints a temporary password").not.toBe("");
});

test.afterAll(() => {
  script("--email", email, "--deactivate");
});

async function signInAsAdmin(page: Page) {
  await page.goto("/admin/sign-in");
  await page.locator("#inb-login-id").fill(email);
  await page.locator("#inb-login-pw").fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/admin\/accounts$/, { timeout: 20_000 });
}


const PAGES: [string, string][] = [
  ["/admin/accounts", "Accounts"],
  ["/admin/status", "System status"],
  ["/admin/backups", "Backups"],
  ["/admin/warnings", "Warnings"],
  ["/admin/notice", "Notice"],
  ["/admin/audit", "Audit log"],
  ["/admin/notifications", "Notifications"],
  ["/admin/profile", "Profile"],
  ["/admin/help", "Help"],
];

for (const [width, height] of [[1280, 900], [390, 844]] as const) {
  test(`at ${width} px: every page opens, fits the screen and is axe clean`, async ({ page }) => {
    // Every page of the portal, each with its own axe check: longer than one journey.
    test.slow();
    await page.setViewportSize({ width, height });
    await signInAsAdmin(page);
    await expect(page.getByText("This portal cannot open students' records, documents, photos or grades.")).toBeVisible();
    if (width >= 768) {
      const menu = page.locator("aside.role-side");
      await expect(menu.getByRole("link", { name: "Accounts", exact: true })).toHaveAttribute("aria-current", "page");
      await menu.getByRole("link", { name: "System status", exact: true }).click();
      await expect(page).toHaveURL(/\/admin\/status$/);
    } else {
      const dock = page.locator("nav.role-dock");
      await dock.getByRole("link", { name: "Backups" }).click();
      await expect(page).toHaveURL(/\/admin\/backups$/);
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

test("Accounts: a search finds the coordinator, and ending their sessions asks first, naming them and the effect", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAsAdmin(page);
  await page.getByRole("searchbox", { name: "Search accounts" }).fill("coordinator.demo@internet.test");
  const row = page.getByRole("row").filter({ hasText: "coordinator.demo@internet.test" });
  await expect(row).toBeVisible();
  await expect(row.getByText("Active")).toBeVisible();
  // The search reloads the list a moment after typing, and a reload closes an open menu: wait for the
  // filtered list (only this account left), and open the menu again if a late reload still closed it.
  await expect(page.getByRole("row").filter({ hasText: "@" })).toHaveCount(1, { timeout: 15_000 });
  const endSessions = page.getByRole("menuitem", { name: "End every session" });
  await expect(async () => {
    if (!(await endSessions.isVisible())) await row.getByRole("button", { name: /Actions for/ }).click();
    await expect(endSessions).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await endSessions.click();
  const dialog = page.getByRole("dialog", { name: "End sessions?" });
  await expect(dialog).toContainText(/End every session of .+ \(coordinator\)\. They will have to sign in again\./);
  // Cancelled: the demo coordinator's session in the other journeys stays.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});

test("System status lists the server's checks with a state each, and Backups never shows a key", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsAdmin(page);
  await page.goto("/admin/status");
  for (const check of ["Database", "Migrations"]) {
    await expect(page.getByRole("listitem").filter({ hasText: new RegExp(`^${check}(OK|Needs attention|Off)`) })).toBeVisible();
  }
  const card = page.locator("section").filter({ has: page.getByRole("heading", { name: "What is switched on" }) }).first();
  await expect(card.getByText(/^(OK|Needs attention|Off)$/).first()).toBeVisible();
  await page.goto("/admin/backups");
  await expect(page.getByRole("heading", { name: "Last runs" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/AGE-SECRET-KEY|BACKUP_R2_SECRET/);
});

test("the maintenance notice shows in a portal once set, and goes when taken down", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAsAdmin(page);
  await page.goto("/admin/notice");
  const message = `Upkeep on Saturday, 8 to 10 PM (${Date.now().toString(36)}).`;
  await page.getByLabel("Maintenance notice").fill(message);
  await page.getByRole("button", { name: "Show the notice" }).click();
  const confirm = page.getByRole("dialog", { name: "Show the notice?" });
  await expect(confirm.getByText("No notice")).toBeVisible();
  await confirm.getByRole("button", { name: "Show the notice" }).click();
  await expect(page.getByRole("status").filter({ hasText: message })).toBeVisible();
  // Taken down again, so no other journey sees it.
  await page.getByRole("button", { name: "Take the notice down" }).click();
  await page.getByRole("dialog", { name: "Take the notice down?" }).getByRole("button", { name: "Take the notice down" }).click();
  await expect(page.getByRole("status").filter({ hasText: message })).toHaveCount(0);
});
