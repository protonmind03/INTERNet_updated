import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, API, api, apiSession, signIn } from "./helpers";

/*
|--------------------------------------------------------------------------
| THE TRAINEE'S SHELL (Iteration 21)
|--------------------------------------------------------------------------
|
| Tooltips only for a mouse or the keyboard; a notification that asks for
| something lands on the thing itself, spotlighted; one that only informs
| opens in a dialog. (The sideways rows are in sidebar-scroll.spec.ts.)
|
*/

/** A fresh trainee of the demo supervisor, signed in through the API, with the privacy notice agreed to. */
async function freshTrainee(label: string) {
  const coordinator = await apiSession("coordinator");
  const supervisor = await apiSession("supervisor");
  const id = `${label}-${Date.now()}`;
  const email = `${id.toLowerCase()}@shell.test`;
  expect((await api(coordinator.token, "POST", "/api/coordinator/students", {
    student_id: id, email, password: "ShellStart123!", name: `Shell ${label}`, supervisor_id: supervisor.id,
  })).status).toBe(201);
  const login = async (password: string) =>
    (await (await fetch(`${API}/api/login/student`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
    })).json()).token as string;
  expect((await api(await login("ShellStart123!"), "PUT", `/api/students/${id}/password`, { current_password: "ShellStart123!", new_password: "ShellCheck456!" })).status).toBe(200);
  const token = await login("ShellCheck456!");
  const privacy = await api<{ notice: { version: string } }>(token, "GET", `/api/students/${id}/privacy`);
  await api(token, "POST", `/api/students/${id}/privacy/consent`, { version: privacy.body.notice.version });
  return { id, email, token, supervisor, coordinator, account: { ...ACCOUNTS.student, email, password: "ShellCheck456!" } };
}

async function openBell(page: Page) {
  await page.getByRole("button", { name: /^Notifications/ }).click();
}

test.describe("on a touch screen", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("tapping the bell leaves no tooltip behind", async ({ page }) => {
    await signIn(page, "student");
    await page.getByRole("button", { name: /^Notifications/ }).tap();
    await page.waitForTimeout(300);
    await expect(page.getByRole("tooltip")).toHaveCount(0);
  });
});

test("a photo-rejected notification opens Attendance with Retake photo spotlighted; an info one opens a dialog", async ({ page }) => {
  const trainee = await freshTrainee("SPOT");
  // The supervisor records a time-in in person, then rejects its photo: the trainee is told.
  const form = new FormData();
  form.set("student_id", trainee.id);
  form.set("reason", "Spotlight check");
  form.set("image", new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9])], { type: "image/jpeg" }), "intern.jpg");
  const recorded = await fetch(`${API}/api/supervisor/attendance/record`, { method: "POST", headers: { Authorization: `Bearer ${trainee.supervisor.token}` }, body: form });
  expect(recorded.status).toBe(201);
  const log = (await recorded.json()).attendance;
  expect((await api(trainee.supervisor.token, "POST", `/api/attendance/${log.id}/reject-time-in`, { reason: "The face is out of the frame." })).status).toBe(200);

  await signIn(page, "student", trainee.account);
  await openBell(page);
  const item = page.getByRole("button", { name: /Time-in photo rejected/ });
  await expect(item).toBeVisible();
  await expect(item).toContainText("Action needed");
  await item.click();
  await expect(page).toHaveURL(/\/daily-log\?spot=retake-photo$/);
  const retake = page.locator('[data-focus="retake-photo"]');
  await expect(retake).toBeFocused();
  await expect(retake).toHaveClass(/inb-spotlight/);
  // The camera is never opened for them.
  await expect(page.getByRole("dialog", { name: /Retake/ })).toHaveCount(0);

  // An info notification (the welcome) is under Announcements and opens in a dialog.
  await openBell(page);
  await page.getByRole("tab", { name: "Announcements" }).click();
  await page.getByRole("button", { name: /^Welcome/ }).first().click();
  const dialog = page.getByRole("dialog", { name: /^Welcome/ });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
