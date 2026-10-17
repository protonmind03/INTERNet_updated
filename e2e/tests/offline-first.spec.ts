import { expect, test, type Page } from "@playwright/test";
import { API, api, apiSession, signIn } from "./helpers";

/*
|--------------------------------------------------------------------------
| OFFLINE-FIRST
|--------------------------------------------------------------------------
|
| Iteration 12. Steps waiting on the phone are sent only when the server
| answers /api/health (the phone saying "online" is not enough); the
| student sees them under "Waiting to send" with their age, until when they
| can still be sent and why the last try failed, and can retry or discard
| them. A review decision made on a record that changed meanwhile is
| refused and the page says so. The Help page has the per-role table.
|
*/

const HOUR = 60 * 60 * 1000;

/** Puts one step in the phone's queue the way the app keeps it. Its log does not exist, so once sent the server refuses it. */
const queueStep = (page: Page, path: "break" | "time-out", hoursAgo: number) =>
  page.evaluate(
    ({ path, occurredAt }) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open("internet-offline");
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const adding = opening.result
            .transaction("queue", "readwrite")
            .objectStore("queue")
            .add({
              owner: `student|${localStorage.getItem("student_id")}`,
              savedAt: new Date().toISOString(),
              data: { logId: 987654321, path, occurredAt, requestId: crypto.randomUUID() },
            });
          adding.onsuccess = () => resolve();
          adding.onerror = () => reject(adding.error);
        };
      }),
    { path, occurredAt: new Date(Date.now() - hoursAgo * HOUR).toISOString() }
  );

const waiting = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const opening = indexedDB.open("internet-offline");
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const counting = opening.result.transaction("queue").objectStore("queue").count();
          counting.onsuccess = () => resolve(counting.result);
          counting.onerror = () => reject(counting.error);
        };
      })
  );

test("waiting steps: held while the server does not answer, shown with age, expiry and the last error; Discard asks first, Retry sends", async ({ page }) => {
  // The phone is "online" all along; only the server's health check fails.
  let healthy = false;
  await page.route(/\/api\/health$/, (route) => (healthy ? route.continue() : route.abort("connectionrefused")));
  await signIn(page, "student");
  expect(await page.evaluate(() => navigator.onLine)).toBe(true);
  await queueStep(page, "time-out", 2);
  // Older than the 12 hours a lunch step may wait.
  await queueStep(page, "break", 13);
  await page.reload();

  const panel = page.getByTestId("waiting-to-send");
  await expect(panel.getByRole("heading", { name: "Waiting to send (2)" })).toBeVisible();
  await expect(panel.getByText(/The server cannot be reached/)).toBeVisible();
  const timeOut = panel.getByTestId("waiting-step").filter({ hasText: "Time-out" });
  await expect(timeOut).toContainText(/\(2 h( \d+ min)? ago\)/);
  await expect(timeOut).toContainText(/Can be sent until .* \((21|22) h( \d+ min)? left\)/);
  await expect(timeOut).toContainText(/Tried \d+ times?.*The server could not be reached\./);
  const lunch = panel.getByTestId("waiting-step").filter({ hasText: "Out for lunch" });
  await expect(lunch).toContainText("Too old to be added: the limit is 12 hours.");
  // Nothing was sent while the server did not answer.
  expect(await waiting(page)).toBe(2);
  // The account button says so too, for when the panel is scrolled away.
  await expect(page.getByTestId("waiting-badge")).toHaveText(/^2\s*steps waiting to send$/);

  // Discard asks first; Cancel keeps it.
  await lunch.getByRole("button", { name: /^Discard out for lunch/ }).click();
  const dialog = page.getByRole("dialog", { name: "Discard this out for lunch?" });
  await expect(dialog).toContainText("cannot be brought back");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(await waiting(page)).toBe(2);
  await lunch.getByRole("button", { name: /^Discard out for lunch/ }).click();
  await dialog.getByRole("button", { name: "Discard" }).click();
  await expect(panel.getByRole("heading", { name: "Waiting to send (1)" })).toBeVisible();
  expect(await waiting(page)).toBe(1);
  await expect(page.getByTestId("waiting-badge")).toHaveText(/^1\s*step waiting to send$/);

  // The server answers again: Retry sends it (and the server refuses this made-up one).
  healthy = true;
  await panel.getByRole("button", { name: "Retry now" }).click();
  await expect(page.getByText(/Your time-out recorded offline was not added/)).toBeVisible({ timeout: 20_000 });
  await expect(panel).toHaveCount(0);
  await expect(page.getByTestId("waiting-badge")).toHaveCount(0);
  expect(await waiting(page)).toBe(0);
});

test("the queue goes by the health check, not the phone's online flag: it is sent once the server answers", async ({ page }) => {
  let healthy = false;
  await page.route(/\/api\/health$/, (route) => (healthy ? route.continue() : route.abort("connectionrefused")));
  await signIn(page, "student");
  await queueStep(page, "time-out", 1);
  await page.reload();
  await expect(page.getByTestId("waiting-to-send")).toBeVisible();
  expect(await waiting(page)).toBe(1);
  // No button pressed: the back-off asks again by itself (3 s, then 6 s…).
  healthy = true;
  await expect(page.getByText(/Your time-out recorded offline was not added/)).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => waiting(page)).toBe(0);
});

test("a decision on a record someone else changed meanwhile is refused, says how it is now, and the page reloads", async ({ browser }) => {
  const student = await apiSession("student");
  const supervisor = await apiSession("supervisor");
  // A weekday up to 30 days ahead (the most an absence can be filed for) that has none yet.
  let filed: { id: number; date: string } | null = null;
  for (let ahead = 5 + Math.floor(Math.random() * 20); !filed && ahead <= 29; ahead += 1) {
    const day = new Date(Date.now() + 8 * HOUR + ahead * 24 * HOUR);
    if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;
    const date = day.toISOString().slice(0, 10);
    const answer = await api<{ absence: { id: number } }>(student.token, "POST", "/api/absences", { date, reason: `Stale check ${Date.now()}` });
    if (answer.status === 201) filed = { id: answer.body.absence.id, date };
  }
  expect(filed, "an absence to decide").not.toBeNull();
  const { id, date } = filed!;
  const label = new Date(`${date}T00:00:00+08:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "Asia/Manila" });

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  // No live updates: the version check is for when they do not arrive in time.
  await page.route(/\/api\/events/, (route) => route.abort());
  try {
    await signIn(page, "supervisor");
    await page.getByRole("tab", { name: /^Absences/ }).click();
    await page.getByRole("button", { name: new RegExp(`Absence · ${label}`) }).first().click();
    await expect(page.getByRole("button", { name: "Excuse", exact: true })).toBeVisible();

    // Meanwhile, on another device: decided, then taken back. It is waiting again, but not as it was.
    expect((await api(supervisor.token, "PATCH", `/api/absences/${id}/review`, { status: "Unexcused", notes: "Decided on the laptop." })).status).toBe(200);
    expect((await api(supervisor.token, "PATCH", `/api/absences/${id}/review`, { status: "Pending", notes: "" })).status).toBe(200);

    await page.getByRole("button", { name: "Excuse", exact: true }).click();
    await expect(page.getByText(/This absence changed while you had it open: it is now pending\. Look at it again before deciding\./).first()).toBeVisible();
    const kept = await api<{ absences: { id: number; status: string; version: number }[] }>(supervisor.token, "GET", "/api/absences/supervisor");
    const now = kept.body.absences.find((absence) => absence.id === id);
    expect(now?.status).toBe("Pending");
    expect(now?.version).toBe(3);

    // Looked at again (the page has reloaded it), the decision goes through.
    await page.getByRole("button", { name: new RegExp(`Absence · ${label}`) }).first().click();
    await page.getByRole("button", { name: "Excuse", exact: true }).click();
    await expect(page.getByText(/Absence excused for/)).toBeVisible();
  } finally {
    await context.close();
    // Closed, so it does not wait in the queue on a later run.
    await api(supervisor.token, "PATCH", `/api/absences/${id}/review`, { status: "Excused", notes: "" });
  }
});

test("the Help page: what works with no connection, for each role, signed in or not", async ({ page }) => {
  // A phone: one section per role.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/help#offline");
  await expect(page.getByRole("heading", { name: "Help", level: 1 })).toBeVisible();
  for (const role of ["Student", "Supervisor", "Coordinator"]) {
    await expect(page.getByRole("heading", { name: role, level: 3 })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // A wide screen: one table.
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole("heading", { name: "With no connection" })).toBeVisible();
  const table = page.getByRole("table");
  for (const role of ["Student", "Supervisor", "Coordinator"]) {
    await expect(table.getByRole("rowheader", { name: role })).toBeVisible();
  }
  await expect(table).toContainText("Time-out: sent within 24 hours");
  await expect(page.getByText(/If someone else changes a record while you have it open/)).toBeVisible();
  // It is part of the first download, so the health of the API does not matter to it.
  expect((await fetch(`${API}/api/health`)).ok).toBe(true);
});
