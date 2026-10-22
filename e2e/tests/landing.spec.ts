import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, signIn } from "./helpers";

/*
|--------------------------------------------------------------------------
| THE LANDING PAGE, THE THREE DOORS AND THE FIRST OPEN (Iteration 23)
|--------------------------------------------------------------------------
|
| "/" is a plain page made when the site is built; it must not load the
| app. Each role signs in at its own door, which links that role's app
| manifest. The installed app's first open shows four slides once.
|
*/

const ROLES = ["student", "supervisor", "coordinator"] as const;

test.describe("the landing page", () => {
  test("is the built page, without the app, and its doors lead to each role's sign-in", async ({ page }) => {
    const scripts: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "script") scripts.push(new URL(request.url()).pathname);
    });
    const response = await page.goto("/");
    // The words are in the HTML itself, before any script runs.
    expect(await response?.text()).toContain("Every role, every screen.");
    await expect(page.getByRole("heading", { level: 1, name: "One system. Every role, every screen." })).toBeVisible();
    await expect(page.locator("#root")).toHaveCount(0);
    expect(scripts.some((path) => /\/assets\/app-/.test(path))).toBe(false);

    // PSU redesign 1E: each portal's card leads to its app's install page; Sign in lists the three doors.
    for (const role of ROLES) {
      await expect(page.locator(`#portal-${role}`).getByRole("link", { name: /^Get the/ })).toHaveAttribute("href", `/${role}/sign-in?install=1`);
    }
    await page.locator(".land-top summary", { hasText: "Sign in" }).click();
    for (const role of ROLES) {
      await expect(page.locator(`#land-signin-top a[href="/${role}/sign-in"]`)).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test("the hero turns the roles and switches the device; How it works starts each role at step 1", async ({ page }) => {
    await page.goto("/");
    const caption = page.locator("[data-hero-caption]");
    await expect(caption).toContainText("Trainee on a phone");
    await page.getByRole("button", { name: "Switch device" }).click();
    await expect(caption).toContainText("Trainee on a tablet");
    await page.getByRole("button", { name: "Next role" }).click();
    await expect(caption).toContainText("Supervisor on a tablet");
    await page.getByRole("button", { name: "Previous role" }).click();
    await page.getByRole("button", { name: "Previous role" }).click();
    await expect(caption).toContainText("Coordinator on a laptop");

    const how = page.locator("#how");
    await how.locator('[data-how-panel="student"] [data-how-step="3"]').click();
    await expect(how.locator('[data-how-panel="student"] [data-how-step="3"]')).toHaveAttribute("aria-current", "step");
    await how.getByRole("tab", { name: "Supervisor" }).click();
    await expect(how.locator('[data-how-panel="supervisor"] [data-how-step="1"]')).toHaveAttribute("aria-current", "step");
    await how.getByRole("tab", { name: "Trainee" }).click();
    await expect(how.locator('[data-how-panel="student"] [data-how-step="1"]')).toHaveAttribute("aria-current", "step");

    // Try to fool it: a pick shows its own answer.
    await page.locator("[data-fool-pick]", { hasText: "Time in twice" }).click();
    await expect(page.locator("#fool-panel")).toContainText("There is one time-in a day.");
  });

  test("on a phone, the menu is a sheet that opens, takes focus and closes", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Menu" }).click();
    const sheet = page.getByRole("dialog", { name: "Menu" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("link", { name: "Get the app" }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/#download$/);
  });

  test("the Download module follows the role and the device, and draws the QR code on a computer", async ({ page }) => {
    await page.goto("/");
    const panel = page.locator("[data-download]");
    // The device is detected in the browser: exactly one tile says so.
    await expect(panel.locator("[data-detected]:not([hidden])")).toHaveCount(1);
    await panel.getByText("Supervisor app").click();
    await panel.getByText("Android", { exact: true }).click();
    await expect(panel.locator('[data-device="android"] [data-install-link]')).toHaveAttribute("href", "/supervisor/sign-in?install=1");
    await expect(panel.locator('[data-device="android"]')).toBeVisible();
    await expect(panel.getByRole("heading", { level: 2 })).toContainText("Install INTERNet for supervisors");
    await panel.getByText("Computer", { exact: true }).click();
    await expect(panel.locator("[data-qr] svg")).toBeVisible();
    await expect(panel.locator('[data-device="desktop"]')).toContainText("supervisor sign-in");
    await panel.getByText("iPhone and iPad", { exact: true }).click();
    await expect(panel.locator('[data-device="ios"]')).toContainText("Add to Home Screen");
  });

  test("once the service worker is in, \"/\" opens the landing page with no connection, and a door the app", async ({ page, context }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // Controlled from the next load on.
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 30_000 }).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("#doors")).toBeVisible();
    await expect(page.locator("#root")).toHaveCount(0);
    await page.goto("/student/sign-in");
    await expect(page.locator("#inb-login-id")).toBeVisible();
    await context.setOffline(false);
  });

  test("/login goes to the doors", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/#doors$/);
  });
});

test.describe("the doors", () => {
  for (const role of ROLES) {
    test(`the ${role} door sets its palette, links its app and shows the seal`, async ({ page }) => {
      await page.goto(`/${role}/sign-in`);
      await expect(page.locator("html")).toHaveAttribute("data-role", role);
      await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", `/manifest-${role}.webmanifest`);
      await expect(page.getByRole("img", { name: "Pangasinan State University seal" }).first()).toBeVisible();
      await expect(page.locator("#inb-login-id")).toBeVisible();
      const manifest = await (await page.request.get(`/manifest-${role}.webmanifest`)).json();
      expect(manifest.id).toBe(`/${role}/`);
    });
  }

  test("a wrong password at another role's door says only that door's message", async ({ page }) => {
    // The demo trainee's email at the supervisor's door: nothing says the address is a trainee's.
    await page.goto("/supervisor/sign-in");
    await page.locator("#inb-login-id").fill(ACCOUNTS.student.email);
    await page.locator("#inb-login-pw").fill(ACCOUNTS.student.password);
    await page.locator('button[type="submit"]').click();
    const alert = page.getByRole("alert").first();
    await expect(alert).toBeVisible();
    await expect(alert).not.toContainText(/student|trainee/i);
    await expect(page).toHaveURL(/\/supervisor\/sign-in$/);
  });

  test("someone signed in who opens another role's door is taken to their own portal", async ({ page }) => {
    await signIn(page, "student");
    await page.goto("/coordinator/sign-in");
    await expect(page).toHaveURL(/\/student\/dashboard$/);
  });

  test("the password pages are themed as the door they came from", async ({ page }) => {
    await page.goto("/supervisor/sign-in");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL(/\/forgot-password\?role=supervisor$/);
    await expect(page.locator("html")).toHaveAttribute("data-role", "supervisor");
  });
});

/** Makes the page believe it was opened from the Home Screen. */
async function asInstalledApp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    const installed = (query: string) =>
      ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
    window.matchMedia = (query: string) => (query.includes("display-mode: standalone") ? installed(query) : real(query));
    // Asking for notifications on its own would be a fault: count every ask.
    (window as unknown as { asked: number }).asked = 0;
    if ("Notification" in window) {
      Notification.requestPermission = (() => {
        (window as unknown as { asked: number }).asked += 1;
        return Promise.resolve("default");
      }) as typeof Notification.requestPermission;
    }
  });
}

test.describe("the installed app's first open", () => {
  test("shows four slides once, swipes and skips, and asks for nothing by itself", async ({ page }) => {
    await asInstalledApp(page);
    await signIn(page, "student");
    const dialog = page.getByRole("dialog", { name: "Welcome to INTERNet Trainee" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("img", { name: "Pangasinan State University seal" })).toBeVisible();
    await dialog.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("dialog", { name: "The camera check and your privacy" })).toBeVisible();
    await page.getByRole("button", { name: "Slide 4: Turn on reminders" }).click();
    await expect(page.getByRole("dialog", { name: "Turn on reminders" })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { asked: number }).asked)).toBe(0);
    await page.getByRole("button", { name: "Skip" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("internet.onboarding.student.v1"))).not.toBeNull();
    await page.reload();
    await expect(page.getByRole("navigation", { name: "Main" }).first()).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Welcome to INTERNet Trainee" })).toHaveCount(0);
  });

  test("does not show in a browser tab", async ({ page }) => {
    await signIn(page, "supervisor");
    await expect(page.getByRole("dialog", { name: "Welcome to INTERNet Supervisor" })).toHaveCount(0);
  });
});
