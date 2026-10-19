import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

/*
|--------------------------------------------------------------------------
| THE STUDENT'S PORTAL AS A FOLDER
|--------------------------------------------------------------------------
|
| Roadmap 3.6 (Iteration 10). The label tab says whose folder it is: name,
| program and company, verified hours. Its tabs are Today, Attendance,
| Tasks, Documents, Schedule and Weekly report; Profile is under the
| avatar. Every student address still opens its page. On a phone the pages
| are reached from the dock (Iteration 21) and the floating time-in button
| keeps its rules.
|
*/

const ROUTES: [string, string][] = [
  ["/student/dashboard", "Today"],
  ["/daily-log", "Attendance"],
  ["/task", "Tasks"],
  ["/documents", "Documents"],
  ["/schedule", "Schedule"],
  ["/journal", "Weekly report"],
  ["/profile", "Profile"],
  ["/student/resolution", "Resolution Center"],
  ["/notifications", "Notifications"],
  ["/time-record", "Time record"],
  ["/announcements", "Announcements"],
  ["/student/completion", "Completion"],
];

test("on a desktop: the label tab, the six tabs, Profile from the avatar, and every student address", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, "student");
  await expect(page.getByText("Demo Student").first()).toBeVisible();
  await expect(page.getByRole("progressbar", { name: /required hours verified/ })).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Main" });
  await expect(tabs.getByRole("link")).toHaveCount(6);

  for (const [path, heading] of ROUTES) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    const lit = page.getByRole("navigation", { name: "Main" }).locator('a[aria-current="page"]');
    // The six are tabs; the rest open in the same folder with no tab lit.
    await expect(lit).toHaveCount(ROUTES.indexOf(ROUTES.find((route) => route[0] === path)!) < 6 ? 1 : 0);
  }
  // Older addresses still lead somewhere.
  for (const old of ["/report", "/student/feedback"]) {
    await page.goto(old);
    await expect(page.getByRole("heading", { level: 1, name: "Resolution Center" })).toBeVisible();
  }

  await page.goto("/student/dashboard");
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("heading", { level: 1, name: "Profile" })).toBeVisible();
});

test("on a phone (Iteration 21): a floating dock of four and More, out of the way while scrolling down, and the time-in button keeps its rules", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "student");
  const dock = page.getByRole("navigation", { name: "Main" });
  await expect(dock.getByRole("link")).toHaveCount(4);
  for (const name of ["Today", "Attendance", "Schedule", "Tasks"]) {
    await expect(dock.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  // 64 px tall, 12 px in from the sides.
  const box = (await dock.boundingBox())!;
  expect(Math.round(box.height)).toBe(64);
  expect(Math.round(box.x)).toBe(12);
  expect(Math.round(390 - box.x - box.width)).toBe(12);
  // Only the current page's label is shown.
  await expect(dock.locator(".student-dock-item--on")).toHaveCount(1);

  // More: the rest, in a sheet.
  await dock.getByRole("button", { name: /^More/ }).click();
  const sheet = page.getByRole("dialog", { name: "More" });
  for (const name of ["Documents", "Weekly report", "Resolution Center", "Help"]) {
    await expect(sheet.getByRole("button", { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  await sheet.getByRole("button", { name: /^Weekly report/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Weekly report" })).toBeVisible();
  await expect(dock.getByRole("button", { name: /^More/ })).toHaveClass(/student-dock-item--on/);

  // It steps aside while the page scrolls down, and comes back on the way up.
  await page.goto("/student/dashboard");
  await page.locator("main").evaluate((element) => {
    element.style.minHeight = "100%";
    const filler = document.createElement("div");
    filler.style.height = "3000px";
    element.querySelector("div")?.appendChild(filler);
  });
  await page.locator("main").evaluate((element) => element.scrollTo({ top: 600 }));
  await expect(page.locator(".student-dock")).toHaveClass(/student-dock--hidden/);
  await page.locator("main").evaluate((element) => element.scrollTo({ top: 200 }));
  await expect(page.locator(".student-dock")).not.toHaveClass(/student-dock--hidden/);

  const fab = page.locator("button.float-fab");
  await expect(fab).toBeVisible();
  // Not on Attendance (the full card is there) or Profile.
  await dock.getByRole("link", { name: /^Attendance/ }).click();
  await expect(page).toHaveURL(/\/daily-log$/);
  await expect(fab).toHaveCount(0);
  await page.goto("/profile");
  await expect(page.getByRole("heading", { level: 1, name: "Profile" })).toBeVisible();
  await expect(fab).toHaveCount(0);

  // Nothing runs off the side at 320 px.
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/student/dashboard");
  await expect(dock).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
