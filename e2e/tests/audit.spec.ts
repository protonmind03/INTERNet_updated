import { expect, test } from "@playwright/test";
import { API, api, apiSession, signIn, today } from "./helpers";

/*
|--------------------------------------------------------------------------
| THE AUDIT OF NOVEMBER 2026: WHAT IT FOUND, KEPT FIXED
|--------------------------------------------------------------------------
|
| A day's report written on the phone while it is offline is kept there
| until it can be sent. If the session ends before then (it expired
| overnight, or was signed out on another device), the words are no longer
| erased with the session: they wait for the same account, and are back
| and sent when the trainee signs in again.
|
*/

test.use({ viewport: { width: 1280, height: 900 } });

test("words typed offline survive a session that ends before they are sent", async ({ page, context }) => {
  const student = await apiSession("student");
  const words = `Helped register the walk-in clients while offline (${Date.now()}).`;
  await signIn(page, "student");
  await page.goto("/journal");
  await expect(page.getByLabel("Your report for the day")).toBeVisible();

  // Offline: the words are kept on the phone.
  await context.setOffline(true);
  await page.getByLabel("Your report for the day").fill(words);
  await expect(page.getByText(/Saved on this phone/).first()).toBeVisible({ timeout: 10_000 });

  // The session ends on the server before the phone is back online.
  const token = await page.evaluate(() => localStorage.getItem("student_token"));
  expect(token).toBeTruthy();
  const out = await fetch(`${API}/api/logout`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  expect(out.ok).toBe(true);

  // Back online: the send is refused, the session is cleared, and the trainee is at the sign-in door.
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page).toHaveURL(/\/student\/sign-in/, { timeout: 20_000 });

  // Signing in again brings the words back, and they are sent.
  await signIn(page, "student");
  await page.goto("/journal");
  await expect(page.getByLabel("Your report for the day")).toHaveValue(words, { timeout: 10_000 });
  await expect(page.getByText("All changes saved").first()).toBeVisible({ timeout: 15_000 });
  const saved = await api<{ reports: { report_date: string; summary: string | null }[] }>(
    student.token,
    "GET",
    `/api/students/${encodeURIComponent(student.id)}/daily-reports?from=${today()}&to=${today()}`
  );
  expect(saved.body.reports.find((report) => report.report_date === today())?.summary).toBe(words);
});
