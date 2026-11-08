import { expect, test, type Page } from "@playwright/test";
import { api, apiSession, signIn } from "./helpers";

/*
|--------------------------------------------------------------------------
| THE TRAINEE'S RESOLUTION CENTER: WHERE IT IS, AND ITS COUNT
|--------------------------------------------------------------------------
|
| PSU redesign, Section 7: the header carries Help, Scan and the bell; the
| Resolution Center is a tab of the Support folder (change1108: the menus
| list only the folders), and its count of concerns with a new coordinator
| reply is on that tab, and summed into Support in the menu.
|
*/

/** The count on the Support folder's Resolution Center tab. */
async function newReplies(page: Page): Promise<number> {
  if (!/\/student\/resolution/.test(page.url())) await page.goto("/student/resolution");
  const entry = page.locator("main nav").getByRole("link", { name: /^Resolution/ });
  // The tab says "…Resolution Center 1 waiting" (the last word is for screen readers).
  const read = async () => {
    const match = /(\d+)\s*(?:waiting)?\s*$/.exec(((await entry.textContent()) || "").trim());
    return match ? Number(match[1]) : 0;
  };
  // The counts arrive a moment after the page: read until two readings a second apart agree.
  let last = await read();
  for (let tries = 0; tries < 8; tries += 1) {
    await page.waitForTimeout(1000);
    const now = await read();
    if (now === last) return now;
    last = now;
  }
  return last;
}

test.describe("the Resolution Center", () => {
  test("on a phone the header has no Resolution Center; it is a tab of Support, which is in More", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "student");
    const header = page.locator(".role-phone-only");
    await expect(header.getByRole("button", { name: /^Notifications/ })).toBeVisible();
    await expect(header.getByRole("link", { name: /^Resolution Center/ })).toHaveCount(0);
    await page.locator(".role-dock").getByRole("button", { name: /^More/ }).click();
    const sheet = page.getByRole("dialog", { name: "More" });
    await sheet.getByRole("button", { name: /^Support/ }).click();
    await page.locator("main nav").getByRole("link", { name: /^Resolution/ }).click();
    await expect(page).toHaveURL(/\/student\/resolution$/);
    await expect(page.locator(".role-dock").getByRole("button", { name: /^More/ })).toHaveClass(/role-dock-item--on/);
  });

  test("on a computer it is a tab of Support; the side menu marks Support when it is open", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page, "student");
    const support = page.locator("aside.role-side").getByRole("link", { name: /^Support/ });
    await support.click();
    await page.locator("main nav").getByRole("link", { name: /^Resolution/ }).click();
    await expect(page).toHaveURL(/\/student\/resolution$/);
    await expect(support).toHaveAttribute("aria-current", "page");
    await expect(page.locator('aside.role-side [aria-current="page"]')).toHaveCount(1);
    await expect(page.locator("main nav").getByRole("link", { name: /^Resolution/ })).toHaveAttribute("aria-current", "page");
  });

  test("counts a concern with a new coordinator reply until the student opens it", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const student = await apiSession("student");
    const coordinator = await apiSession("coordinator");
    const stamp = `Badge check ${Date.now()}`;
    const filed = await api<{ complaint?: { id: number }; id?: number }>(student.token, "POST", "/api/complaints", {
      student_id: student.id,
      report_type: "supervisor",
      supervisor_name: "Demo Supervisor",
      company_name: "Demo Company",
      category: "Workplace safety",
      description: `${stamp}: the fire exit was locked.`,
    });
    expect(filed.status, JSON.stringify(filed.body)).toBe(201);

    await signIn(page, "student");
    const before = await newReplies(page);
    const concernId = filed.body.complaint?.id ?? filed.body.id;
    expect((await api(coordinator.token, "POST", `/api/complaints/${concernId}/messages`, { message: "We have asked the company to unlock it." })).status).toBe(201);

    await page.reload();
    await expect.poll(() => newReplies(page)).toBe(before + 1);

    // Opening the conversation reads it.
    await page.goto("/student/resolution");
    const concern = page.getByRole("listitem").filter({ hasText: stamp });
    await concern.getByRole("button", { name: /Conversation with the coordinator/ }).click();
    await expect(concern.getByText("We have asked the company to unlock it.")).toBeVisible();
    await expect.poll(() => newReplies(page)).toBe(before);
  });
});
