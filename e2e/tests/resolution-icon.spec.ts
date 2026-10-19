import { expect, test, type Page } from "@playwright/test";
import { api, apiSession, signIn } from "./helpers";

/*
|--------------------------------------------------------------------------
| THE STUDENT'S RESOLUTION CENTER ICON
|--------------------------------------------------------------------------
*/

/** How many concerns the icon says have a new reply. */
async function newReplies(page: Page): Promise<number> {
  const name = (await page.getByRole("link", { name: /^Resolution Center/ }).getAttribute("aria-label")) || "";
  const match = /^Resolution Center, (\d+) concerns? with a new reply$/.exec(name);
  return match ? Number(match[1]) : 0;
}

test.describe("the Resolution Center icon", () => {
  test("sits left of the bell with a name, a tooltip and a 44-pixel target, and has left the account menu", async ({ page }) => {
    await signIn(page, "student");
    const icon = page.getByRole("link", { name: /^Resolution Center/ });
    const bell = page.getByRole("button", { name: /^Notifications/ });
    await expect(icon).toBeVisible();
    const [iconBox, bellBox] = [(await icon.boundingBox())!, (await bell.boundingBox())!];
    expect(iconBox.width).toBeGreaterThanOrEqual(44);
    expect(iconBox.height).toBeGreaterThanOrEqual(44);
    expect(iconBox.x + iconBox.width).toBeLessThanOrEqual(bellBox.x + 1);
    // No text label beside it; the tooltip names it on focus.
    await expect(icon).toHaveText("");
    await icon.focus();
    const tip = page.getByRole("tooltip", { name: "Resolution Center" });
    await expect.poll(() => tip.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");

    // On a phone the account menu no longer lists it.
    await page.getByRole("button", { name: /Account menu for/ }).click();
    await expect(page.getByRole("button", { name: "Profile" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Resolution Center" })).toHaveCount(0);
  });

  // Iteration 21: the header is three tracks; below 360 px the role pill is a dot.
  for (const width of [320, 360, 390]) {
    test(`at ${width} px the role mark and the icon never overlap`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await signIn(page, "student");
      const icon = page.getByRole("link", { name: /^Resolution Center/ });
      const role = width < 360 ? page.getByRole("img", { name: "Trainee" }) : page.locator(".role-pill").first();
      await expect(role).toBeVisible();
      const [a, b] = [(await role.boundingBox())!, (await icon.boundingBox())!];
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlap).toBe(false);
    });
  }

  test("on a desktop it is the same icon, not a labelled button", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page, "student");
    const icon = page.getByRole("link", { name: /^Resolution Center/ });
    await expect(icon).toBeVisible();
    await expect(icon).toHaveText("");
    await icon.click();
    await expect(page).toHaveURL(/\/student\/resolution$/);
  });

  test("counts a concern with a new coordinator reply until the student opens it", async ({ page }) => {
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
    // The badge shows the same number the name says.
    await expect(page.getByRole("link", { name: /^Resolution Center/ }).getByText(String(before + 1), { exact: true })).toBeVisible();

    // Opening the conversation reads it.
    await page.getByRole("link", { name: /^Resolution Center/ }).click();
    const concern = page.getByRole("listitem").filter({ hasText: stamp });
    await concern.getByRole("button", { name: /Conversation with the coordinator/ }).click();
    await expect(concern.getByText("We have asked the company to unlock it.")).toBeVisible();
    await expect.poll(() => newReplies(page)).toBe(before);
  });
});
