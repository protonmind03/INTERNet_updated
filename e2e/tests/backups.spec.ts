import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

/*
|--------------------------------------------------------------------------
| BACKUPS ON THE STATUS CARD
|--------------------------------------------------------------------------
|
| Iteration 15. Profile settings > What is switched on says when the last
| backup worked and asks for a restore drill once a month; recording a drill
| takes a line saying what was restored and checked.
|
*/

test("the status card shows the database backup and the restore drill, and a drill can be recorded", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, "coordinator");
  await page.goto("/coordinator/status");
  const card = page.locator("section").filter({ has: page.getByRole("heading", { name: "What is switched on" }) }).first();
  await expect(card.getByText(/^Database backup/).first()).toBeVisible();
  await expect(card.getByText(/^Restore drill/).first()).toBeVisible();

  await card.getByRole("button", { name: "Record a drill" }).click();
  const dialog = page.getByRole("dialog", { name: "Record a restore drill" });
  // A line is needed.
  await dialog.getByRole("button", { name: "Record it" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(/Say which backup was restored/);
  const line = `Restored the nightly backup to a scratch database (${Date.now()}); row counts matched.`;
  await dialog.getByLabel("What was restored and checked").fill(line);
  await dialog.getByRole("button", { name: "Record it" }).click();
  await expect(page.getByText(/Restore drill recorded/)).toBeVisible();
  await expect(card.getByText(line, { exact: false })).toBeVisible();
});
