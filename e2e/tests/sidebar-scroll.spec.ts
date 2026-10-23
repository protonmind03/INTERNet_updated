import { expect, test, type Locator } from "@playwright/test";
import { signIn } from "./helpers";

/*
|--------------------------------------------------------------------------
| THE SIDEBAR'S SCROLL PANE
|--------------------------------------------------------------------------
|
| Roadmap 5.8. One class for the menus of all three portals: room kept for
| a thin bar, no scrolling of the page behind, edge fades only when there
| is more that way, and the brand block and account footer fixed while
| only the list scrolls. Since the PSU redesign the three side menus are
| one component (components/RoleShell.tsx), each in its role's colour.
|
*/

const style = (pane: Locator, property: string) =>
  pane.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);

test("the coordinator's menu: the shared side menu, fades only when there is more, header and footer fixed", async ({ page }) => {
  // Short enough that the menu has to scroll.
  await page.setViewportSize({ width: 1280, height: 420 });
  await signIn(page, "coordinator");
  const aside = page.locator("aside.role-side");
  const pane = aside.getByRole("navigation", { name: "Main" });
  await expect(pane).toHaveClass(/inb-scroll-pane/);
  expect(await aside.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  expect(await style(pane, "scrollbar-gutter")).toContain("stable");
  expect(await style(pane, "overscroll-behavior-y")).toBe("contain");

  // At the top: a fade below only.
  await expect(pane).toHaveAttribute("data-more-below", "");
  await expect(pane).not.toHaveAttribute("data-more-above", "");
  const footer = aside.getByRole("button", { name: "Sign out" });
  const footerBefore = await footer.boundingBox();

  await pane.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  // At the end: a fade above only, the bar at full contrast while it moves, and the footer where it was.
  await expect(pane).toHaveAttribute("data-more-above", "");
  await expect(pane).not.toHaveAttribute("data-more-below", "");
  expect((await footer.boundingBox())?.y).toBe(footerBefore?.y);

  // Tall enough for everything: no fades at all.
  await page.setViewportSize({ width: 1280, height: 1000 });
  await expect(pane).not.toHaveAttribute("data-more-below", "");
  await expect(pane).not.toHaveAttribute("data-more-above", "");
});

test("the same pane in the trainee's and the supervisor's side menus", async ({ browser }) => {
  for (const role of ["student", "supervisor"] as const) {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await signIn(page, role);
    await expect(page.locator("aside.role-side").getByRole("navigation", { name: "Main" })).toHaveClass(/inb-scroll-pane/);
    await page.context().close();
  }
});

test("a dialog whose body scrolls can be reached with the keyboard, one that fits is no extra stop", async ({ browser }) => {
  // The only violation in both axe sweeps (scrollable-region-focusable): a sheet taller than a
  // short phone's screen scrolled, but Tab could not reach it to scroll with the arrow keys.
  const short = await (await browser.newContext({ viewport: { width: 390, height: 360 }, isMobile: true, hasTouch: true })).newPage();
  await signIn(short, "coordinator");
  await short.goto("/coordinator/holidays");
  await short.getByRole("button", { name: "Add holiday" }).first().click();
  const body = short.getByRole("region", { name: "Add holiday" });
  await expect(body).toHaveAttribute("tabindex", "0");
  await body.focus();
  await short.keyboard.press("End");
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await short.context().close();

  const tall = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await signIn(tall, "coordinator");
  await tall.goto("/coordinator/holidays");
  await tall.getByRole("button", { name: "Add holiday" }).first().click();
  await expect(tall.getByRole("dialog", { name: "Add holiday" })).toBeVisible();
  await expect(tall.getByRole("region", { name: "Add holiday" })).toHaveCount(0);
  await tall.context().close();
});

// Iteration 21: every sideways area shares one rule set (.inb-snap-row in brand.css);
// since the PSU redesign the first-open slides are the one sideways row left.
test.describe("sideways rows", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the first-open slides are the same kind of row (Iteration 23)", async ({ page }) => {
    // Opened as an installed app, so the slides show.
    await page.addInitScript(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (query: string) =>
        query.includes("display-mode: standalone")
          ? ({ matches: true, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false } as unknown as MediaQueryList)
          : real(query);
    });
    await signIn(page, "coordinator");
    const row = page.locator(".onboarding-row");
    await expect(row).toBeVisible();
    const styles = await row.evaluate((element) => {
      const style = getComputedStyle(element);
      return { snap: style.scrollSnapType, bar: style.scrollbarWidth, overscroll: style.overscrollBehaviorX, axis: element.getAttribute("data-axis"), tab: element.getAttribute("tabindex") };
    });
    expect(styles.snap).toContain("mandatory");
    expect(styles.bar).toBe("none");
    expect(styles.overscroll).toBe("contain");
    expect(styles.axis).toBe("x");
    expect(styles.tab).toBe("0");
    await expect(row).toHaveAttribute("data-more-below", "");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});
