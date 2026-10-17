import { expect, test } from "@playwright/test";
import { ACCOUNTS, API, api, apiSession, signIn } from "./helpers";

/*
|--------------------------------------------------------------------------
| REJECTING A TIME-IN PHOTO, AND APPEALING IT
|--------------------------------------------------------------------------
|
| The supervisor rejects only the photo of today's open log; the student is
| asked to retake it and appeals instead; the coordinator overturns the
| rejection. A new student is made for it, timed in through the API with a
| camera-check ticket (a supervisor's in-person time-in never waits for
| review, so it cannot be rejected this way).
|
*/

// The smallest file the server accepts as a JPEG.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9]);

test("a rejected time-in photo: the supervisor's choice, the student's banner, an appeal, and the coordinator overturning it", async ({ browser }) => {
  const coordinator = await apiSession("coordinator");
  const supervisor = await apiSession("supervisor");
  const id = `REJ-${Date.now()}`;
  const email = `${id.toLowerCase()}@reject.test`;
  const name = `Reject Check ${id.slice(-5)}`;
  expect((await api(coordinator.token, "POST", "/api/coordinator/students", {
    student_id: id, email, password: "RejectStart123!", name, supervisor_id: supervisor.id,
  })).status).toBe(201);
  const login = async (password: string) =>
    (await (await fetch(`${API}/api/login/student`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
    })).json()).token as string;
  expect((await api(await login("RejectStart123!"), "PUT", `/api/students/${id}/password`, { current_password: "RejectStart123!", new_password: "RejectCheck456!" })).status).toBe(200);
  const token = await login("RejectCheck456!");
  const privacy = await api<{ notice: { version: string } }>(token, "GET", `/api/students/${id}/privacy`);
  await api(token, "POST", `/api/students/${id}/privacy/consent`, { version: privacy.body.notice.version });

  // Today's open log, with a photo, as the camera check sends it.
  const challenge = (await api<{ ticket: string; prompts: string[] }>(token, "POST", "/api/attendance/liveness-challenge")).body;
  const form = new FormData();
  form.set("student_id", id);
  form.set("liveness_ticket", challenge.ticket);
  form.set("liveness_report", JSON.stringify({ completed: challenge.prompts, flash: "skipped", attempts: 1 }));
  form.set("image", new Blob([JPEG], { type: "image/jpeg" }), "time-in.jpg");
  const timedIn = await fetch(`${API}/api/attendance`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  const recorded = await timedIn.json();
  expect(timedIn.status, JSON.stringify(recorded)).toBe(201);
  const logId = (recorded.attendance?.id ?? recorded.id) as number;

  try {
    // The supervisor: two ways to reject, each needing a reason.
    const supervisorContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const sp = await supervisorContext.newPage();
    await signIn(sp, "supervisor");
    await sp.goto(`/supervisor/dashboard?focus=attendance-${logId}`);
    const photo = sp.getByRole("button", { name: "Reject time-in (photo)" });
    await expect(photo).toBeVisible({ timeout: 20_000 });
    await expect(sp.getByRole("button", { name: "Reject attendance" })).toBeVisible();
    await photo.click();
    await expect(sp.getByRole("alert")).toContainText("Write a reason first");
    await sp.locator("#decision-note").fill("The photo is too dark to see your face.");
    await photo.click();
    await expect(sp.getByText(/Time-in photo rejected\. .* has been asked to retake it\./)).toBeVisible();
    await supervisorContext.close();

    // The student: a banner on every page, with the deadline and the button.
    const studentContext = await browser.newContext();
    const page = await studentContext.newPage();
    await signIn(page, "student", { ...ACCOUNTS.student, email, password: "RejectCheck456!" });
    const banner = page.getByRole("status").filter({ hasText: "Retake your time-in photo" });
    await expect(banner).toContainText("before you tap Back from lunch");
    await expect(banner).toContainText("The photo is too dark to see your face.");
    await expect(banner.getByRole("button", { name: "Retake photo" })).toBeVisible();

    // An appeal instead, from the Attendance page.
    await page.goto("/daily-log");
    await page.getByRole("button", { name: "Appeal to the coordinator" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Appeal to the coordinator" });
    await dialog.getByLabel("Why should it be changed?").fill("The office lights were off at 8 AM; my face is there.");
    await dialog.getByRole("button", { name: "Send appeal" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Appeal waiting for the coordinator.").first()).toBeVisible();

    // The coordinator overturns it, with a note.
    const coordinatorContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const cp = await coordinatorContext.newPage();
    await signIn(cp, "coordinator");
    await cp.goto("/coordinator/appeals");
    const card = cp.getByRole("listitem").filter({ hasText: name });
    await expect(card).toContainText("Rejected time-in photo");
    await expect(card).toContainText("The office lights were off at 8 AM");
    await card.getByLabel("Your note to the student and the supervisor").fill("The face is visible; the photo stands.");
    await card.getByRole("button", { name: "Overturn it" }).click();
    await expect(cp.getByText(/Appeal overturned\./)).toBeVisible();
    await coordinatorContext.close();

    // The student: no new photo is needed any more, and the log says why.
    await page.reload();
    await expect(page.getByText("Appeal accepted.").first()).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Retake your time-in photo" })).toHaveCount(0);
    await studentContext.close();
  } finally {
    await api(coordinator.token, "PATCH", `/api/coordinator/students/${id}/status`, { is_active: false });
  }
});
