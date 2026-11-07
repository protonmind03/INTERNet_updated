import { expect, test } from "@playwright/test";
import { api, apiSession, signIn, today } from "./helpers";

/*
|--------------------------------------------------------------------------
| PROGRESS REPORTS (revisions, November 2026)
|--------------------------------------------------------------------------
|
| Daily: the day's report saves as it is typed; an event is added with a
| title, saves itself, and takes a photo. With no connection a photo is
| kept on the phone, said so, and sent once the phone is back online.
| Weekly and Monthly are the other two parts of the same page.
|
*/

test.use({ viewport: { width: 1280, height: 900 } });

/** A small real JPEG, drawn in the page. */
async function jpeg(page: import("@playwright/test").Page, colour: string): Promise<Buffer> {
  const base64 = await page.evaluate((fill) => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext("2d")!;
    context.fillStyle = fill;
    context.fillRect(0, 0, 640, 480);
    return canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
  }, colour);
  return Buffer.from(base64, "base64");
}

test("a day's report saves as it is typed, and an event takes photos, kept on the phone when offline", async ({ page, context }) => {
  const student = await apiSession("student");
  const words = `Shelved the returned books and helped at the desk (${Date.now()}).`;
  const eventTitle = `Reading event for children (${Date.now()})`;

  await signIn(page, "student");
  await page.goto("/journal");
  await expect(page.getByRole("heading", { level: 1, name: "Progress reports" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Daily" })).toHaveAttribute("aria-selected", "true");

  // The day's report saves by itself.
  const summary = page.getByLabel("Your report for the day");
  await summary.fill(words);
  await expect(page.getByText("All changes saved").first()).toBeVisible({ timeout: 10_000 });
  const saved = await api<{ reports: { report_date: string; summary: string | null }[] }>(
    student.token,
    "GET",
    `/api/students/${encodeURIComponent(student.id)}/daily-reports?from=${today()}&to=${today()}`
  );
  expect(saved.body.reports.find((report) => report.report_date === today())?.summary).toBe(words);

  // An event, with its title saved by itself.
  const events = page.locator("article").filter({ has: page.getByLabel("Event title") });
  const before = await events.count();
  await page.getByRole("button", { name: "Add an event" }).click();
  await expect(events).toHaveCount(before + 1);
  const event = events.last();
  await event.getByLabel("Event title").fill(eventTitle);
  await expect(event.getByText("All changes saved")).toBeVisible({ timeout: 10_000 });

  // A photo from the phone goes up at once.
  await event.locator('input[type="file"][multiple]').setInputFiles({ name: "desk.jpg", mimeType: "image/jpeg", buffer: await jpeg(page, "#a84a0c") });
  await expect(event.getByRole("button", { name: /^Open / }).first()).toBeVisible({ timeout: 15_000 });

  // With no connection: kept on the phone, and said so.
  await context.setOffline(true);
  await event.locator('input[type="file"][multiple]').setInputFiles({ name: "event.jpg", mimeType: "image/jpeg", buffer: await jpeg(page, "#1a237e") });
  await expect(event.getByText(/saved on this phone, waiting to be sent/)).toBeVisible();
  await expect(event.getByRole("button", { name: /Save a copy to your phone/ })).toBeVisible();

  // Back online: sent, and the note goes.
  await context.setOffline(false);
  await expect(page.getByText(/report photo kept on this phone was sent/)).toBeVisible({ timeout: 15_000 });
  await expect(event.getByText(/saved on this phone, waiting to be sent/)).toHaveCount(0);

  // The other two parts of the page.
  await page.getByRole("tab", { name: "Weekly" }).click();
  await expect(page).toHaveURL(/view=weekly/);
  await expect(page.getByRole("button", { name: "Print FM-AA-INT-19" })).toBeVisible();
  await page.getByRole("tab", { name: "Monthly" }).click();
  await expect(page).toHaveURL(/view=monthly/);
  await expect(page.getByRole("heading", { name: "In your own words" })).toBeVisible();
  await expect(page.getByText(eventTitle).first()).toBeVisible();

  // The photos are in the album on the profile, under Reports, without being copied.
  await page.goto("/profile");
  await page.getByRole("link", { name: /^Album/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Album" })).toBeVisible();
  await page.getByRole("tab", { name: /^Reports/ }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^Open ${eventTitle.replace(/[()]/g, ".")}`) }).first()).toBeVisible();
});
