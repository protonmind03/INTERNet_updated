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

    // The revision: the portal cards are an overview only; the top bar leads to each role's own page; Sign in lists the three doors.
    for (const role of ROLES) {
      await expect(page.locator(`#portal-${role}`)).toBeVisible();
      await expect(page.locator(`#portal-${role}`).getByRole("link")).toHaveCount(0);
    }
    for (const [role, path] of [["trainees", "/for-trainees"], ["supervisors", "/for-supervisors"], ["coordinators", "/for-coordinators"]]) {
      // In the top bar on a computer, in the Menu sheet on a narrower screen.
      await expect(page.locator(".land-nav a", { hasText: `For ${role}` })).toHaveAttribute("href", path);
      await expect(page.locator(".land-sheet a", { hasText: `For ${role}` })).toHaveAttribute("href", path);
    }
    // Home leads back to the landing page; "How it works" is reached from the hero, not the top bar.
    await expect(page.locator(".land-nav a", { hasText: "Home" })).toHaveAttribute("href", "/");
    await expect(page.locator(".land-nav a", { hasText: "How it works" })).toHaveCount(0);
    await page.locator(".land-top summary", { hasText: "Sign in" }).click();
    for (const role of ROLES) {
      // fix 10-26: a door opens in a new tab, so the website stays open.
      await expect(page.locator(`#land-signin-top a[href="/${role}/sign-in"]`)).toBeVisible();
      await expect(page.locator(`#land-signin-top a[href="/${role}/sign-in"]`)).toHaveAttribute("target", "_blank");
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

  test("the wheel inside the checks box walks the items; outside it, the page scrolls on", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/");
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
      const section = document.querySelector("#checks")!;
      window.scrollTo(0, section.getBoundingClientRect().top + window.scrollY - 64);
    });
    const box = (await page.locator(".checks-sticky").boundingBox())!;
    const picked = page.locator('[data-fool-pick][aria-pressed="true"]');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const before = await page.evaluate(() => window.scrollY);
    for (let i = 0; i < 2; i++) {
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(400);
    }
    await expect(picked).toHaveAttribute("data-fool-pick", "2");
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
    // In the margin beside the box the page moves and the item stays.
    await page.mouse.move(Math.max(2, box.x / 2), box.y + box.height / 2);
    await page.mouse.wheel(0, 200);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
    await expect(picked).toHaveAttribute("data-fool-pick", "2");
  });

  test("on a phone, the menu is a sheet that opens, takes focus and closes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Menu" }).click();
    const sheet = page.getByRole("dialog", { name: "Menu" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("link", { name: "For trainees" }).click();
    await expect(page).toHaveURL(/\/for-trainees$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("proven one day at a time");
  });

  test("the top bar stays at the top, and Back to top shows only past the first section", async ({ page }) => {
    await page.goto("/");
    const top = page.locator(".land-top");
    // Off, it is hidden from assistive technology too, so it is found by its mark.
    const fab = page.locator("[data-back-to-top]");
    await expect(fab).not.toHaveAttribute("data-on", "");
    await page.locator("#how").scrollIntoViewIfNeeded();
    await expect(fab).toHaveAttribute("data-on", "");
    expect((await top.boundingBox())?.y).toBe(0);
    await fab.click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5);
    await expect(fab).not.toHaveAttribute("data-on", "");
  });

  test("each section of the landing page fits one screen at 100% zoom", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/");
    const heights = await page.$$eval("#doors, #how", (sections) => sections.map((section) => section.getBoundingClientRect().height));
    for (const height of heights) expect(height).toBeLessThanOrEqual(768 - 64 + 1);
    expect(await page.locator(".hero").evaluate((hero) => hero.getBoundingClientRect().height)).toBeLessThanOrEqual(768);
    // The hero's controls are on the first screen.
    const caption = await page.locator("[data-hero-caption]").boundingBox();
    expect((caption?.y ?? 9999) + (caption?.height ?? 0)).toBeLessThanOrEqual(768);
  });

  test("a role's page installs that role's app: the device is detected, and the QR code drawn on a computer", async ({ page }) => {
    await page.goto("/for-supervisors");
    const panel = page.locator("[data-download]");
    // The device is detected in the browser: exactly one tile says so, and the card says which.
    await expect(panel.locator("[data-detected]:not([hidden])")).toHaveCount(1);
    await expect(panel.locator("[data-install-title]")).toContainText(/^You're on/);
    await panel.getByText("Android tablet or phone", { exact: true }).click();
    await expect(panel.locator('[data-device="android"] [data-install-link]')).toHaveAttribute("href", "/supervisor/sign-in?install=1");
    await expect(panel.locator('[data-device="android"]')).toBeVisible();
    await expect(panel.getByRole("heading", { level: 2 })).toContainText("Install INTERNet for supervisors");
    await panel.getByText("Computer", { exact: true }).click();
    await expect(panel.locator("[data-qr] svg")).toBeVisible();
    await expect(panel.locator('[data-device="desktop"]')).toContainText("supervisor sign-in");
    await panel.getByText("iPad or iPhone", { exact: true }).click();
    await expect(panel.locator('[data-device="ios"]')).toContainText("Add to Home Screen");
  });

  for (const [path, role] of [["/for-trainees", "student"], ["/for-coordinators", "coordinator"]] as const) {
    test(`${path} is a built page, without the app, and signs in at its own door`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator("#root")).toHaveCount(0);
      await expect(page.locator("main")).toHaveAttribute("data-role", role);
      await expect(page.getByRole("link", { name: /^Sign in as a/ }).first()).toHaveAttribute("href", `/${role}/sign-in`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    });
  }

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

  test("the Help centre leads back to the landing page, not to a portal", async ({ page }) => {
    await page.goto("/help");
    const back = page.getByRole("link", { name: "Back to INTERNet" });
    await expect(back).toHaveAttribute("href", "/");
    await back.click();
    await expect(page.locator("#doors")).toBeVisible();
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

    test(`the ${role} door fits one screen and leads nowhere else`, async ({ page }) => {
      for (const size of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(size);
        await page.goto(`/${role}/sign-in`);
        await expect(page.locator("#inb-login-id")).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(0);
        await expect(page.getByText("INTERNet home")).toHaveCount(0);
        await expect(page.getByText(/^Not an? (trainee|supervisor|coordinator)\?/)).toHaveCount(0);
        await expect(page.locator('a[href="/"]')).toHaveCount(0);
      }
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

  test("with Keep me signed in off, the next browser session starts signed out", async ({ page, context }) => {
    await page.goto("/supervisor/sign-in");
    await page.locator("#inb-login-id").fill(ACCOUNTS.supervisor.email);
    await page.locator("#inb-login-pw").fill(ACCOUNTS.supervisor.password);
    await page.getByLabel("Keep me signed in").uncheck();
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/supervisor\/dashboard$/, { timeout: 20_000 });
    // A reload is the same session: still signed in.
    await page.reload();
    await expect(page).toHaveURL(/\/supervisor\/dashboard$/);
    // A new tab from scratch is a new browser session (no sessionStorage): signed out.
    const fresh = await context.newPage();
    await fresh.goto("/supervisor/dashboard");
    await expect(fresh).toHaveURL(/\/supervisor\/sign-in$/);
    await fresh.close();
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
