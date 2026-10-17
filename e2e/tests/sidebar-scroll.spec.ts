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
