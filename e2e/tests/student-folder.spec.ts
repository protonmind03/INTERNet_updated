import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

/*
|--------------------------------------------------------------------------
| THE TRAINEE'S PORTAL: FOLDERS, ONE ENTRY PER PAGE
|--------------------------------------------------------------------------
|
| Revisions, November 2026 (pages/student/hubs.ts). The trainee's pages are
| grouped into folders: Attendance (Days, Schedule, My progress, Time
| record), Tasks (Tasks, Documents, Reports, Completion) and Support
| (Messages, Announcements, Resolution Center). On a computer the side menu
| lists Today, the folders and the Support section, and exactly one entry
| is marked: the folder the page is in. Inside, the folder's tab for the
| page is marked. Help is the header's button on every page, with the whole
| Help centre in it. On a phone the dock holds Today, Attendance, Tasks and
| Reports; More holds Support; Scan, left of the bell, is the day's next
| step. Every student address still opens its page.
|
*/

type Where = { menu: string | "account" | null; tab?: string };

const ROUTES: [string, string, Where][] = [
  ["/student/dashboard", "Today", { menu: "Today" }],
  ["/daily-log", "Attendance", { menu: "Attendance", tab: "Days" }],
  ["/schedule", "Schedule", { menu: "Attendance", tab: "Schedule" }],
  ["/schedule?view=progress", "My progress", { menu: "Attendance", tab: "My progress" }],
  ["/time-record", "Time record", { menu: "Attendance", tab: "Time record" }],
  ["/task", "Tasks", { menu: "Tasks", tab: "Tasks" }],
  ["/documents", "Documents", { menu: "Tasks", tab: "Documents" }],
  ["/journal", "Progress reports", { menu: "Tasks", tab: "Reports" }],
  ["/student/completion", "Completion", { menu: "Tasks", tab: "Completion" }],
  ["/messages", "Messages", { menu: "Messages", tab: "Messages" }],
  ["/announcements", "Announcements", { menu: "Announcements", tab: "Announcements" }],
  ["/student/resolution", "Resolution Center", { menu: "Resolution Center", tab: "Resolution Center" }],
  ["/student/help", "Help", { menu: null }],
  ["/profile", "Profile", { menu: "account" }],
  ["/notifications", "Notifications", { menu: null }],
];

test("on a computer: the side menu marks the page's folder, the folder marks its tab, and every student address opens", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, "student");
  const menu = page.locator("aside.role-side");
  // The side menu: Today, the two folders, then Support. Help and Feedback are no longer entries.
  for (const name of ["Today", "Attendance", "Tasks", "Messages", "Announcements", "Resolution Center"]) {
    await expect(menu.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  for (const name of ["Help", "Feedback", "Schedule", "Documents", "Time record"]) {
    await expect(menu.getByRole("link", { name: new RegExp(`^${name}$`) })).toHaveCount(0);
  }

  for (const [path, heading, where] of ROUTES) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    const lit = menu.locator('[aria-current="page"]');
    if (where.menu === "account") {
      await expect(lit).toHaveCount(1);
      await expect(lit).toHaveClass(/role-side-account/);
    } else if (where.menu) {
      await expect(lit).toHaveCount(1);
      await expect(lit).toContainText(where.menu);
    } else {
      await expect(lit).toHaveCount(0);
    }
    if (where.tab) {
      const tab = page.locator("main nav").getByRole("link", { name: new RegExp(`^${where.tab}`) });
      await expect(tab).toHaveAttribute("aria-current", "page");
    }
  }

  // Older addresses still lead to their page: Feedback is now a section of the Resolution Center.
  for (const old of ["/report", "/student/feedback", "/student/resolution?tab=evaluations"]) {
    await page.goto(old);
    await expect(page.getByRole("heading", { level: 1, name: "Resolution Center" })).toBeVisible();
  }
  await page.goto("/student/feedback");
  await expect(page).toHaveURL(/\/student\/resolution\?tab=feedback$/);
  await expect(page.getByRole("tab", { name: "Feedback" })).toHaveAttribute("aria-selected", "true");

  // Help is on every page, with the whole Help centre in it.
  await page.goto("/task");
  await page.getByRole("button", { name: "Help", exact: true }).click();
  const help = page.getByRole("dialog");
  await expect(help.getByRole("heading", { name: "Trainee help" })).toBeVisible();
  await expect(help.getByRole("heading", { name: "With no connection" })).toBeVisible();
  await help.getByRole("button", { name: "Close help" }).click();

  // On a computer Scan is "Time in from your phone": a QR code.
  await page.locator("[data-testid=scan-button]:visible").click();
  const scan = page.getByRole("dialog", { name: "Time in from your phone" });
  await expect(scan).toBeVisible();
  await expect(scan.getByRole("img", { name: /QR code/ })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/student/dashboard");
  await menu.locator("a.role-side-account").click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("heading", { level: 1, name: "Profile" })).toBeVisible();
});

test("on a phone: a dock of Today, Attendance, Tasks and Reports, Support under More, and Scan for the day's next step", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "student");
  const dock = page.locator(".role-dock");
  await expect(dock.getByRole("link")).toHaveCount(4);
  for (const name of ["Today", "Attendance", "Tasks", "Reports"]) {
    await expect(dock.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  // 64 px tall, 12 px in from the sides.
  const box = (await dock.boundingBox())!;
  expect(Math.round(box.height)).toBe(64);
  expect(Math.round(box.x)).toBe(12);
  expect(Math.round(390 - box.x - box.width)).toBe(12);
  await expect(dock.locator(".role-dock-item--on")).toHaveCount(1);

  // Documents is in the Tasks folder, so Tasks is lit there.
  await page.goto("/documents");
  await expect(dock.getByRole("link", { name: /^Tasks/ })).toHaveClass(/role-dock-item--on/);

  // More: Support, with the account (which opens Profile) at the bottom.
  await dock.getByRole("button", { name: /^More/ }).click();
  const sheet = page.getByRole("dialog", { name: "More" });
  for (const name of ["Messages", "Announcements", "Resolution Center"]) {
    await expect(sheet.getByRole("button", { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  await expect(sheet.locator(".more-sheet-item").filter({ hasText: /^Profile$/ })).toHaveCount(0);
  await sheet.getByRole("button", { name: /^Resolution Center/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Resolution Center" })).toBeVisible();
  await expect(dock.getByRole("button", { name: /^More/ })).toHaveClass(/role-dock-item--on/);
  await expect(dock.locator(".role-dock-item--on")).toHaveCount(1);

  // It steps aside while the page scrolls down, and comes back on the way up. The page itself scrolls.
  await page.goto("/student/dashboard");
  await page.locator("main").evaluate((element) => {
    const filler = document.createElement("div");
    filler.style.height = "3000px";
    element.appendChild(filler);
  });
  await page.evaluate(() => window.scrollTo({ top: 600 }));
  await expect(dock).toHaveClass(/role-dock--hidden/);
  await page.evaluate(() => window.scrollTo({ top: 200 }));
  await expect(dock).not.toHaveClass(/role-dock--hidden/);

  // The round floating button is gone: Scan, in the header, is the next step on every page.
  await page.goto("/task");
  await expect(page.locator("button.float-fab")).toHaveCount(0);
  await expect(page.locator("[data-testid=scan-button]:visible")).toBeVisible();

  // Nothing runs off the side at 320 px.
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/student/dashboard");
  await expect(dock).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
