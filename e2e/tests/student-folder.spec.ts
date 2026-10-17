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
| avatar. Every student address still opens its page. On a phone the tabs
| scroll sideways and the floating time-in button keeps its rules.
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

test("on a phone: the tabs scroll under the header, and the time-in button keeps its rules", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "student");
  const tabs = page.getByRole("navigation", { name: "Main" });
  await expect(tabs).toHaveAttribute("data-axis", "x");
  // Six tabs do not fit a phone's width: more lie to the right.
  await expect(tabs).toHaveAttribute("data-more-below", "");
  // A tab far to the right is brought into view when its page opens.
  await page.goto("/journal");
  await expect(page.getByRole("heading", { level: 1, name: "Weekly report" })).toBeVisible();
  const row = (await page.getByRole("navigation", { name: "Main" }).boundingBox())!;
  const lit = (await page.getByRole("navigation", { name: "Main" }).locator('a[aria-current="page"]').boundingBox())!;
  expect(lit.x).toBeGreaterThanOrEqual(row.x);
  expect(lit.x + lit.width).toBeLessThanOrEqual(row.x + row.width);
  await page.goto("/student/dashboard");
  const fab = page.locator("button.float-fab");
  await expect(fab).toBeVisible();
  // Not on Attendance (the full card is there) or Profile.
  await tabs.getByRole("link", { name: "Attendance" }).click();
  await expect(page).toHaveURL(/\/daily-log$/);
  await expect(fab).toHaveCount(0);
  await page.goto("/profile");
  await expect(page.getByRole("heading", { level: 1, name: "Profile" })).toBeVisible();
  await expect(fab).toHaveCount(0);
  // The tab row stays under the header while the page scrolls.
  await page.goto("/student/dashboard");
  const before = (await page.getByRole("navigation", { name: "Main" }).boundingBox())!;
  await page.locator("main").evaluate((element) => element.scrollTo({ top: 600 }));
  await expect.poll(async () => (await page.getByRole("navigation", { name: "Main" }).boundingBox())!.y).toBeLessThan(before.y);
  const header = (await page.locator("header").first().boundingBox())!;
  const after = (await page.getByRole("navigation", { name: "Main" }).boundingBox())!;
  expect(after.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
});
