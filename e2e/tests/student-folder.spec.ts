import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

/*
|--------------------------------------------------------------------------
| THE TRAINEE'S PORTAL: ONE SHELL, ONE ENTRY PER PAGE
|--------------------------------------------------------------------------
|
| PSU redesign, Section 7 and the menu review. On a computer every page is
| an entry of the side menu, and exactly one entry is marked; Profile is
| the account at the menu's foot. On a phone the pages are reached from
| the dock and More (Iteration 21) and the floating time-in button keeps
| its rules. Every student address still opens its page.
|
*/

const ROUTES: [string, string, "menu" | "account" | "none"][] = [
  ["/student/dashboard", "Today", "menu"],
  ["/daily-log", "Attendance", "menu"],
  ["/task", "Tasks", "menu"],
  ["/documents", "Documents", "menu"],
  ["/schedule", "Schedule", "menu"],
  ["/journal", "Weekly report", "menu"],
  ["/student/resolution", "Resolution Center", "menu"],
  ["/student/feedback", "Feedback", "menu"],
  ["/time-record", "Time record", "menu"],
  ["/announcements", "Announcements", "menu"],
  ["/student/completion", "Completion", "menu"],
  ["/student/help", "Help", "menu"],
  ["/profile", "Profile", "account"],
  ["/notifications", "Notifications", "none"],
];

test("on a computer: one side-menu entry per page, exactly one marked, Profile from the account, and every student address", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, "student");
  const menu = page.locator("aside.role-side");
  for (const [path, heading, where] of ROUTES) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    const lit = menu.locator('[aria-current="page"]');
    if (where === "menu") {
      await expect(lit).toHaveCount(1);
      await expect(lit).toContainText(heading);
    } else if (where === "account") {
      await expect(lit).toHaveCount(1);
      await expect(lit).toHaveClass(/role-side-account/);
    } else {
      await expect(lit).toHaveCount(0);
    }
  }
  // Older addresses still lead to their page.
  for (const [old, heading] of [
    ["/report", "Resolution Center"],
    ["/student/resolution?tab=evaluations", "Feedback"],
  ]) {
    await page.goto(old);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }

  await page.goto("/student/dashboard");
  await menu.locator("a.role-side-account").click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("heading", { level: 1, name: "Profile" })).toBeVisible();
});

test("on a phone (Iteration 21): a floating dock of four and More, out of the way while scrolling down, and the time-in button keeps its rules", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "student");
  const dock = page.locator(".role-dock");
  await expect(dock.getByRole("link")).toHaveCount(4);
  for (const name of ["Today", "Attendance", "Schedule", "Tasks"]) {
    await expect(dock.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  // 64 px tall, 12 px in from the sides.
  const box = (await dock.boundingBox())!;
  expect(Math.round(box.height)).toBe(64);
  expect(Math.round(box.x)).toBe(12);
  expect(Math.round(390 - box.x - box.width)).toBe(12);
  // Only the current page's entry is lit.
  await expect(dock.locator(".role-dock-item--on")).toHaveCount(1);

  // More: the rest, in a sheet, with the account (which opens Profile) at the bottom.
  await dock.getByRole("button", { name: /^More/ }).click();
  const sheet = page.getByRole("dialog", { name: "More" });
  for (const name of ["Documents", "Weekly report", "Resolution Center", "Feedback", "Help"]) {
    await expect(sheet.getByRole("button", { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  await expect(sheet.locator(".more-sheet-item").filter({ hasText: /^Profile$/ })).toHaveCount(0);
  await sheet.getByRole("button", { name: /^Weekly report/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Weekly report" })).toBeVisible();
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

  // Not where the page carries the step buttons itself (Today's time card), nor on Profile.
  const fab = page.locator("button.float-fab");
  await expect(fab).toHaveCount(0);
  await dock.getByRole("link", { name: /^Attendance/ }).click();
  await expect(page).toHaveURL(/\/daily-log$/);
  await expect(fab).toBeVisible();
  await page.goto("/profile");
  await expect(page.getByRole("heading", { level: 1, name: "Profile" })).toBeVisible();
  await expect(fab).toHaveCount(0);

  // Nothing runs off the side at 320 px.
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/student/dashboard");
  await expect(dock).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
