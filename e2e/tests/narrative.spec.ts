import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

/*
|--------------------------------------------------------------------------
| NARRATIVE REPORT ON INTERNSHIP TRAINING (revisions, November 2026)
|--------------------------------------------------------------------------
|
| The binder in the university's order: a part is written here and saves
| itself; a starting draft from the record can be used; the requirements
| list says which are on file; the whole report downloads as a Word file.
|
*/

test.use({ viewport: { width: 1280, height: 900 } });

test("a part of the narrative report saves as it is written, a starting draft can be used, and it downloads as Word", async ({ page }) => {
  await signIn(page, "student");
  await page.goto("/journal");
  await page.locator("main nav").getByRole("link", { name: /^Narrative/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Narrative report" })).toBeVisible();

  // The university's order: Title Page first, the agreement and requirements at the end.
  const outline = page.getByRole("navigation", { name: "Parts of the narrative report" });
  await expect(outline.getByText("Title Page")).toBeVisible();
  await expect(outline.getByText("Pictures Depicting OJT Experiences")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Memorandum of Agreement and Internship Requirements/ })).toBeVisible();
  await expect(page.getByText("Training Supervisor's Feedback Form")).toBeVisible();

  // A written part saves itself.
  await outline.getByRole("button", { name: /Dedication/ }).click();
  const words = `To my family, who waited up for me (${Date.now()}).`;
  await page.getByLabel("III. Dedication").fill(words);
  await expect(page.getByText("All changes saved")).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByLabel("III. Dedication")).toHaveValue(words);

  // The introduction's starting draft, from the record.
  await outline.getByRole("button", { name: /Introduction/ }).click();
  await page.getByText("From your records: a starting draft").click();
  await page.getByRole("button", { name: "Use this draft" }).click();
  // Already written (an earlier run): the draft goes below what is there.
  const ask = page.getByRole("dialog", { name: "Use the starting draft?" });
  if (await ask.isVisible().catch(() => false)) await ask.getByRole("button", { name: "Put it below" }).click();
  await expect(page.getByLabel("A. Introduction")).toHaveValue(/I had my On-the-Job Training at/);

  // The whole report as a Word file.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Word file" }).click();
  expect((await download).suggestedFilename()).toMatch(/^Narrative Report - .*\.docx$/);
});
