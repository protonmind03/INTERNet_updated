import { expect, test } from "@playwright/test";
import { openProfileGroup, signIn } from "./helpers";

/*
|--------------------------------------------------------------------------
| THE REQUIREMENTS PACK (Phase 1.1, migration 078)
|--------------------------------------------------------------------------
|
| The coordinator sees the medical, clearance and academic items with what
| sets them apart; the student gives the optional sex (on Account, with
| its one reason) and the SSS and Pag-IBIG numbers (on Contact).
|
*/

test("the coordinator's requirements list the pack: restricted, needed before deployment, by category", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, "coordinator");
  await page.goto("/coordinator/requirements");
  const xray = page.getByRole("listitem").filter({ has: page.getByText("Chest X-ray", { exact: true }) });
  await expect(xray.getByText("Medical", { exact: true })).toBeVisible();
  await expect(xray.getByText(/Reviewed by the coordinator · Restricted · Needed before deployment/)).toBeVisible();
  const pregnancy = page.getByRole("listitem").filter({ has: page.getByText("Pregnancy test", { exact: true }) });
  await expect(pregnancy.getByText(/Female students only/)).toBeVisible();
});

test("a student gives the optional sex on Account and the SSS and Pag-IBIG numbers on Contact", async ({ page }) => {
  await signIn(page, "student");
  await page.goto("/profile");

  await openProfileGroup(page, "Account");
  const sex = page.getByLabel(/^Sex/);
  await expect(sex).toBeVisible();
  await expect(page.getByText("Used only to choose which medical requirements you are asked for.")).toBeVisible();
  await page.keyboard.press("Escape");

  await openProfileGroup(page, "Contact");
  await expect(page.getByText("Advised, for employment after OJT. Only you and the OJT office see them.")).toBeVisible();
  const sss = page.getByLabel(/^SSS number/);
  await sss.fill("12345");
  await page.getByRole("button", { name: "Save numbers" }).click();
  await expect(page.getByText("An SSS number has 10 digits, as in 34-5678901-2.")).toBeVisible();
  await sss.fill("3456789012");
  await page.getByRole("button", { name: "Save numbers" }).click();
  await expect(sss).toHaveValue("34-5678901-2");
  // Leave the demo account as it was.
  await sss.fill("");
  await page.getByRole("button", { name: "Save numbers" }).click();
  await expect(sss).toHaveValue("");
});
