import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

/*
|--------------------------------------------------------------------------
| THE TRAINEE'S PORTAL: FOLDERS, ONE ENTRY PER PAGE
|--------------------------------------------------------------------------
|
| Revisions, November 2026, revised again for change1108 (pages/student/
| hubs.ts). The trainee's pages are grouped into four folders: Attendance
| (Days, Schedule, My progress, Time record), Tasks (Tasks, Documents,
| Completion), Reports (Daily, Weekly, Monthly, Narrative) and Support
| (Messages, Announcements, Resolution Center). The menus list only Today
| and the folders, never a folder's parts (those are the folder's tabs),
| and exactly one entry is marked. On a computer the side menu is a rail
| of icons that opens over the page while pointed at; the profile stays a
| badge with a tooltip. No folder part has buttons of its own above the
| folder (Time record lost its "Back to attendance"). Help is the header's
| button; Scan, left of the bell, is the day's next step. Every student
| address still opens its page.
|
*/

type Where = { menu: string | "account" | null; tab?: string };

const ROUTES: [string, string, Where][] = [
  ["/student/dashboard", "Today", { menu: "Today" }],
  ["/daily-log", "Days", { menu: "Attendance", tab: "Days" }],
  ["/schedule", "Schedule", { menu: "Attendance", tab: "Schedule" }],
  ["/schedule?view=progress", "My progress", { menu: "Attendance", tab: "My progress" }],
  ["/time-record", "Time record", { menu: "Attendance", tab: "Time record" }],
  ["/task", "Tasks", { menu: "Tasks", tab: "Tasks" }],
  ["/documents", "Documents", { menu: "Tasks", tab: "Documents" }],
  ["/documents/forms", "Fill and print", { menu: "Tasks", tab: "Documents" }],
  ["/student/completion", "Completion", { menu: "Tasks", tab: "Completion" }],
  ["/journal", "Daily reports", { menu: "Reports", tab: "Daily" }],
  ["/journal?view=weekly", "Weekly report", { menu: "Reports", tab: "Weekly" }],
  ["/journal?view=monthly", "Monthly reports", { menu: "Reports", tab: "Monthly" }],
  ["/student/narrative", "Narrative report", { menu: "Reports", tab: "Narrative" }],
  ["/messages", "Messages", { menu: "Support", tab: "Messages" }],
  ["/announcements", "Announcements", { menu: "Support", tab: "Announcements" }],
  ["/student/resolution", "Resolution Center", { menu: "Support", tab: "Resolution Center" }],
  ["/student/help", "Help", { menu: null }],
  ["/profile", "Profile", { menu: "account" }],
  ["/notifications", "Notifications", { menu: null }],
];

test("on a computer: the side menu lists only the folders, marks the page's folder, and every student address opens", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, "student");
  const menu = page.locator("aside.role-side");
  // Today and the four folders, nothing else: a folder's parts are its tabs, never repeated in the menu.
  const entries = menu.locator("nav a");
  await expect(entries).toHaveCount(5);
  for (const name of ["Today", "Attendance", "Tasks", "Reports", "Support"]) {
    await expect(menu.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  for (const name of ["Help", "Feedback", "Schedule", "Documents", "Time record", "Messages", "Announcements", "Resolution Center"]) {
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
      await expect(lit).toHaveAccessibleName(new RegExp(`^${where.menu}`));
    } else {
      await expect(lit).toHaveCount(0);
    }
    if (where.tab) {
      const tab = page.locator("main nav").getByRole("link", { name: new RegExp(`^${where.tab}`) });
      await expect(tab).toHaveAttribute("aria-current", "page");
    }
  }

  // Time record has no button of its own above the folder any more.
  await page.goto("/time-record");
  await expect(page.getByRole("link", { name: "Back to attendance" })).toHaveCount(0);

  // Older addresses still lead to their page: Feedback is now a section of the Resolution Center.
  for (const old of ["/report", "/student/feedback", "/student/resolution?tab=evaluations"]) {
    await page.goto(old);
    await expect(page.getByRole("heading", { level: 1, name: "Resolution Center" })).toBeVisible();
  }
  await page.goto("/student/feedback");
  await expect(page).toHaveURL(/\/student\/resolution\?tab=feedback$/);
  await expect(page.getByRole("tab", { name: "Feedback" })).toHaveAttribute("aria-selected", "true");
  // A returned weekly report's old link lands on the Weekly tab.
  await page.goto("/journal?spot=supervisor-note");
  await expect(page).toHaveURL(/view=weekly/);
  await expect(page.locator("main nav").getByRole("link", { name: /^Weekly/ })).toHaveAttribute("aria-current", "page");

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

test("on a computer: the menu is a rail that opens over the page on hover, and the profile stays a badge with a tooltip", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await signIn(page, "student");
  const menu = page.locator("aside.role-side");
  const main = page.locator("main");
  const before = (await main.boundingBox())!;
  // Closed: a rail of icons, no words.
  await expect(menu).toHaveAttribute("data-collapsed", "true");
  expect(Math.round((await menu.boundingBox())!.width)).toBe(68);
  await expect(menu.locator(".role-side-text").first()).toBeHidden();

  // Pointed at: it opens over the page, narrower than before (208 px), and the page does not move.
  await menu.hover();
  await expect(menu).not.toHaveAttribute("data-collapsed", "true");
  await expect.poll(async () => Math.round((await menu.boundingBox())!.width)).toBe(208);
  await expect(menu.locator(".role-side-text").first()).toBeVisible();
  const during = (await main.boundingBox())!;
  expect(Math.round(during.x)).toBe(Math.round(before.x));
  expect(Math.round(during.width)).toBe(Math.round(before.width));

  // The profile stays a round badge, and says what it is in a tooltip.
  const account = menu.locator("a.role-side-account");
  await expect(account).toHaveAccessibleName(/^Profile, /);
  await account.hover();
  const tip = account.locator(".role-side-tip");
  await expect(tip).toContainText("Profile");
  await expect.poll(() => tip.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  // Sign out sits beside the badge while the menu is open (it warns about steps not yet sent).
  await expect(menu.getByRole("button", { name: "Sign out" })).toBeVisible();

  // The pointer leaves: it closes.
  await page.mouse.move(900, 500);
  await expect(menu).toHaveAttribute("data-collapsed", "true");
  // The keyboard opens it too, and Escape closes it.
  await menu.getByRole("link", { name: /^Today/ }).focus();
  await page.keyboard.press("Tab");
  await expect(menu).not.toHaveAttribute("data-collapsed", "true");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("data-collapsed", "true");
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

  // Documents is in the Tasks folder, so Tasks is lit there; the Narrative is in Reports.
  await page.goto("/documents");
  await expect(dock.getByRole("link", { name: /^Tasks/ })).toHaveClass(/role-dock-item--on/);
  await page.goto("/student/narrative");
  await expect(dock.getByRole("link", { name: /^Reports/ })).toHaveClass(/role-dock-item--on/);

  // More: the Support folder as one entry (its parts are its tabs), with the account at the bottom.
  await page.goto("/student/dashboard");
  await dock.getByRole("button", { name: /^More/ }).click();
  const sheet = page.getByRole("dialog", { name: "More" });
  await expect(sheet.getByRole("button", { name: /^Support/ })).toBeVisible();
  for (const name of ["Messages", "Announcements", "Resolution Center"]) {
    await expect(sheet.getByRole("button", { name: new RegExp(`^${name}`) })).toHaveCount(0);
  }
  await sheet.getByRole("button", { name: /^Support/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Messages" })).toBeVisible();
  await expect(page.locator("main nav").getByRole("link", { name: /^Resolution/ })).toBeVisible();
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

  // "Mark all as read" and other page buttons sit in the folder on a phone too.
  await page.goto("/notifications");
  await expect(page.locator(".student-folder")).toBeVisible();

  // Nothing runs off the side at 320 px.
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/student/dashboard");
  await expect(dock).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
