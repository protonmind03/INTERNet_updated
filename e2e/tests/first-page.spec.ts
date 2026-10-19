import { expect, test } from "@playwright/test";
import { ACCOUNTS, type Role } from "./helpers";

/*
|--------------------------------------------------------------------------
| AFTER SIGN-IN: THE FIRST PAGE IN ITS OWN SHAPE (P2)
|--------------------------------------------------------------------------
|
| Iteration 14: the shaped skeleton was chosen. After Sign in the role's
| first page opens at once (no launch screen of a set length), drawn as
| placeholders where its figures and lists will be, which fill in place.
| Here the data is held back as on a slow phone, and the page must not jump
| when it arrives: the layout shift stays under 0.1, the "good" line.
|
*/

const FIRST_LIST: Record<Role, RegExp> = {
  student: /\/api\/(dashboard|attendance)\//,
  supervisor: /\/api\/(supervisor|tasks\/supervisor|documents\/supervisor|absences\/supervisor|journals\/supervisor)/,
  coordinator: /\/api\/(coordinator|analytics)/,
};

for (const role of ["student", "supervisor", "coordinator"] as Role[]) {
  test(`${role}: after Sign in the first page opens at once in its own shape and does not jump when the data arrives`, async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 900 });
    // Every layout shift not caused by the person's own input, as the browser reports it.
    await page.addInitScript(() => {
      const shifts: number[] = [];
      (window as unknown as { __shifts: number[] }).__shifts = shifts;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
          if (!entry.hadRecentInput) shifts.push(entry.value);
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    const account = ACCOUNTS[role];
    await page.goto(`/${role}/sign-in`);
    await page.locator("#inb-login-id").fill(account.email);
    await page.locator("#inb-login-pw").fill(account.password);

    // The first page's data comes late, as on a slow connection.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(FIRST_LIST[role], async (route) => {
      await held;
      await route.continue();
    });

    await page.locator('button[type="submit"]').click();
    // The page, not a launch screen: the address changes as soon as the sign-in is answered.
    await expect(page).toHaveURL(new RegExp(`${account.home}$`), { timeout: 5_000 });
    await expect(page.getByRole("status", { name: /^Loading INTERNet/ })).toHaveCount(0);
    // While the data is held back the page is already drawn, with placeholders where it will be.
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator(".animate-skeleton").first()).toBeVisible();
    // A greeting by name, from the account on this phone, before anything has loaded.
    if (role !== "coordinator") await expect(page.getByText(/^Good (morning|afternoon|evening), \S+/).first()).toBeVisible();

    release();
    await expect(page.locator(".animate-skeleton")).toHaveCount(0, { timeout: 20_000 });
    await page.waitForTimeout(800);
    const total = await page.evaluate(() => (window as unknown as { __shifts: number[] }).__shifts.reduce((sum, value) => sum + value, 0));
    expect(total, "layout shift while the first page loaded").toBeLessThan(0.1);
  });
}
