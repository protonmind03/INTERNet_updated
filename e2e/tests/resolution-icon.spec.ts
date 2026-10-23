import { expect, test, type Page } from "@playwright/test";
import { api, apiSession, signIn } from "./helpers";

/*
|--------------------------------------------------------------------------
| THE TRAINEE'S RESOLUTION CENTER: WHERE IT IS, AND ITS COUNT
|--------------------------------------------------------------------------
|
| PSU redesign, Section 7: the header carries Help and the bell only; the
| Resolution Center is an entry of the menu (More on a phone, the side menu
| on a computer), and its count of concerns with a new coordinator reply
| moved there with it.
|
*/

/** The count on the side menu's Resolution Center entry. */
async function newReplies(page: Page): Promise<number> {
  const entry = page.locator("aside.role-side").getByRole("link", { name: /^Resolution Center/ });
  const name = (await entry.textContent()) || "";
  const match = /(\d+)\s*$/.exec(name.trim());
  return match ? Number(match[1]) : 0;
}

test.describe("the Resolution Center", () => {
  test("on a phone the header has Help and the bell only, and the Resolution Center is in More", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "student");
    const header = page.locator(".role-phone-only");
    await expect(header.getByRole("button", { name: /^Notifications/ })).toBeVisible();
    await expect(header.getByRole("link", { name: /^Resolution Center/ })).toHaveCount(0);
    await page.locator(".role-dock").getByRole("button", { name: /^More/ }).click();
    const sheet = page.getByRole("dialog", { name: "More" });
    await sheet.getByRole("button", { name: /^Resolution Center/ }).click();
    await expect(page).toHaveURL(/\/student\/resolution$/);
    await expect(page.locator(".role-dock").getByRole("button", { name: /^More/ })).toHaveClass(/role-dock-item--on/);
  });

  test("on a computer it is one entry of the side menu, marked when open", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page, "student");
    const entry = page.locator("aside.role-side").getByRole("link", { name: /^Resolution Center/ });
    await entry.click();
    await expect(page).toHaveURL(/\/student\/resolution$/);
    await expect(entry).toHaveAttribute("aria-current", "page");
    await expect(page.locator('aside.role-side [aria-current="page"]')).toHaveCount(1);
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
    await page.locator("aside.role-side").getByRole("link", { name: /^Resolution Center/ }).click();
    const concern = page.getByRole("listitem").filter({ hasText: stamp });
    await concern.getByRole("button", { name: /Conversation with the coordinator/ }).click();
    await expect(concern.getByText("We have asked the company to unlock it.")).toBeVisible();
    await expect.poll(() => newReplies(page)).toBe(before);
  });
});
