import { expect, test } from "@playwright/test";
import { api, apiSession, signIn } from "./helpers";

/*
|--------------------------------------------------------------------------
| OVERTIME (Phase 1.4)
|--------------------------------------------------------------------------
|
| The trainee asks for overtime on a day three weeks ahead from the Days
| page (offline, asking says it needs a connection and the reason stays);
| the supervisor approves it from the Review queue's Overtime chip; the
| trainee sees it approved. Cancelled at the end, so no other journey sees
| it.
|
*/

function dayAhead(weeks: number): string {
  const now = new Date(Date.now() + 8 * 3_600_000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + weeks * 7 + 1)).toISOString().slice(0, 10);
}

const workDate = dayAhead(3);

test.afterAll(async () => {
  const student = await apiSession("student");
  const mine = await api<{ requests: { id: number; work_date: string; status: string }[] }>(student.token, "GET", `/api/students/${encodeURIComponent(student.id)}/overtime`);
  for (const request of mine.body.requests ?? []) {
    if (request.work_date === workDate && (request.status === "pending" || request.status === "approved")) {
      await api(student.token, "POST", `/api/students/${encodeURIComponent(student.id)}/overtime/${request.id}/cancel`);
    }
  }
});

test("a trainee asks for overtime, offline is told it needs a connection, and the supervisor approves it in Review", async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "student");
  await page.goto("/daily-log");
  const card = page.locator("#overtime");
  await expect(card.getByText(/\d+ of \d+ approved this week/)).toBeVisible();

  await card.getByRole("button", { name: "Ask for overtime" }).click();
  const dialog = page.getByRole("dialog", { name: "Ask for overtime" });
  await dialog.getByLabel("Day").fill(workDate);
  await dialog.getByLabel("From").fill("17:00");
  await dialog.getByLabel("Until").fill("19:00");
  await dialog.getByLabel("Why").fill("Year-end inventory count with the team.");

  // Offline: refused with a clear message; the dialog and the words stay.
  await page.context().setOffline(true);
  await dialog.getByRole("button", { name: "Send the request" }).click();
  await expect(dialog.getByRole("alert")).toContainText(/needs a connection/);
  await page.context().setOffline(false);
  await expect(dialog.getByLabel("Why")).toHaveValue("Year-end inventory count with the team.");
  await dialog.getByRole("button", { name: "Send the request" }).click();
  await expect(page.getByText("Overtime request sent to your supervisor.")).toBeVisible();
  await expect(card.getByText("Waiting", { exact: true }).first()).toBeVisible();

  // The supervisor: one more chip in Review.
  const supervisorPage = await (await browser.newContext()).newPage();
  await supervisorPage.setViewportSize({ width: 1280, height: 900 });
  await signIn(supervisorPage, "supervisor");
  await supervisorPage.goto("/supervisor/dashboard");
  await supervisorPage.getByRole("tab", { name: /^Overtime/ }).click();
  await supervisorPage.getByRole("button", { name: /^Review Overtime/ }).first().click();
  await expect(supervisorPage.getByText(/From 17:00 until 19:00\. \d+ of \d+ approved that week\./)).toBeVisible();
  await supervisorPage.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(supervisorPage.getByText(/Overtime approved for/)).toBeVisible();
  await supervisorPage.context().close();

  await page.reload();
  await expect(page.locator("#overtime").getByText("Approved", { exact: true }).first()).toBeVisible();
});
