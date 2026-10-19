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
| only the list scrolls. The coordinator's sidebar wears the student's
| style (brand/tokens.ts, SIDEBAR).
|
*/

const style = (pane: Locator, property: string) =>
  pane.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);

test("the coordinator's menu: student-style sidebar, fades only when there is more, header and footer fixed", async ({ page }) => {
  // Short enough that the menu has to scroll.
  await page.setViewportSize({ width: 1280, height: 520 });
  await signIn(page, "coordinator");
  const aside = page.locator("aside").filter({ has: page.getByRole("navigation", { name: "Main" }) }).first();
  const pane = aside.getByRole("navigation", { name: "Main" });
  await expect(pane).toHaveClass(/inb-scroll-pane/);
  await expect(aside).toHaveClass(/surface-brand/);
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

test("the same pane in the student's sidebar and, sideways, in the supervisor's phone menu", async ({ browser }) => {
  const student = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await signIn(student, "student");
  await expect(student.getByRole("navigation", { name: "Main" }).first()).toHaveClass(/inb-scroll-pane/);
  await student.context().close();

  const supervisor = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await signIn(supervisor, "supervisor");
  const row = supervisor.locator('nav[aria-label="Main"][data-axis="x"]');
  await expect(row).toHaveClass(/inb-scroll-pane/);
  // Six pages on a phone's width: more lies to the right, none to the left yet.
  await expect(row).toHaveAttribute("data-more-below", "");
  await expect(row).not.toHaveAttribute("data-more-above", "");
  await supervisor.context().close();
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

// Iteration 21: every sideways area shares one rule set (.inb-snap-row in brand.css).
test.describe("sideways rows", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the figure cards and the day pager snap, hide their scrollbar, and keep the page from moving", async ({ page }) => {
    await signIn(page, "student");
    await page.goto("/daily-log");
    const rows = page.locator(".inb-snap-row");
    await expect(rows.first()).toBeVisible();
    for (const row of await rows.all()) {
      const styles = await row.evaluate((element) => {
        const style = getComputedStyle(element);
        return { snap: style.scrollSnapType, bar: style.scrollbarWidth, overscroll: style.overscrollBehaviorX, axis: element.getAttribute("data-axis") };
      });
      expect(styles.snap).toContain("x");
      expect(styles.snap).toContain("mandatory");
      expect(styles.bar).toBe("none");
      expect(styles.overscroll).toBe("contain");
      expect(styles.axis).toBe("x");
    }
    // The figure cards have more to the right, so that edge fades; the first edge does not.
    const cards = page.locator(".figure-cards");
    await expect(cards).toHaveAttribute("data-more-below", "");
    await expect(cards).not.toHaveAttribute("data-more-above", "");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

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
