import { expect, test, type Page } from "@playwright/test";
import { API, ACCOUNTS, api, apiSession, signIn, today } from "./helpers";

/*
|--------------------------------------------------------------------------
| PICTURES (WORKSTREAM D)
|--------------------------------------------------------------------------
|
| Iteration 13. A picture chosen for a time-out with no connection waits on
| the phone with it and is sent after it, with a 480-pixel WebP preview made
| on the phone. Lists show the preview; the picture opens whole on a tap.
| The time-out's pictures now show on the coordinator's record (the day
| panel) and on the supervisor's month calendar. A HEIC file is refused with
| what to change on the phone. The coordinator's ZIP can include pictures.
|
*/

/** A small real picture, drawn in the page. */
const drawPicture = async (page: Page) =>
  Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 900;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#0d47a1";
      context.fillRect(0, 0, 1200, 900);
      context.fillStyle = "#f5c518";
      context.fillRect(200, 200, 600, 400);
      return canvas.toDataURL("image/png").split(",")[1];
    }),
    "base64"
  );

/** A new student of the demo supervisor, signed up and agreed to the notice, with today's log open. */
async function freshStudent() {
  const coordinator = await apiSession("coordinator");
  const supervisor = await apiSession("supervisor");
  const id = `PIX-${Date.now()}`;
  const email = `${id.toLowerCase()}@pictures.test`;
  const name = `Pia Pictures ${id.slice(-5)}`;
  expect((await api(coordinator.token, "POST", "/api/coordinator/students", {
    student_id: id, email, password: "PicturesStart123!", name, supervisor_id: supervisor.id, required_hours: 160,
  })).status).toBe(201);
  const login = async (password: string) =>
    (await (await fetch(`${API}/api/login/student`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
    })).json()).token as string;
  expect((await api(await login("PicturesStart123!"), "PUT", `/api/students/${id}/password`, { current_password: "PicturesStart123!", new_password: "PicturesCheck456!" })).status).toBe(200);
  const token = await login("PicturesCheck456!");
  const privacy = await api<{ notice: { version: string } }>(token, "GET", `/api/students/${id}/privacy`);
  await api(token, "POST", `/api/students/${id}/privacy/consent`, { version: privacy.body.notice.version });
  // Today's log, started the way a phone with no connection would have.
  const started = await api(token, "POST", "/api/attendance/offline-time-in", {
    occurred_at: new Date(Date.now() - 60 * 60_000).toISOString(),
    client_request_id: `pictures-${Date.now()}`,
  });
  expect(started.status).toBe(201);
  const logs = await api<{ attendance: { id: number; date: string }[] }>(token, "GET", `/api/attendance/${id}`);
  const log = logs.body.attendance.find((entry) => entry.date === today())!;
  return { id, email, name, token, log, coordinator, supervisor, account: { ...ACCOUNTS.student, email, password: "PicturesCheck456!" } };
}

test("a picture chosen for a time-out with no connection waits with it, is sent after it with its preview, and shows on the record and the calendar", async ({ page, context, browser }) => {
  const s = await freshStudent();
  await signIn(page, "student", s.account);
  const picture = await drawPicture(page);
  await page.goto("/student/dashboard");
  await expect(page.getByRole("button", { name: /^Time out/ }).locator("visible=true").first()).toBeVisible();

  // No connection: the time-out and its picture are kept on the phone.
  await context.setOffline(true);
  await page.getByRole("button", { name: /^Time out/ }).locator("visible=true").first().click();
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  await expect(dialog.getByText(/With no connection, the pictures wait on this phone/)).toBeVisible();
  await dialog.locator("#accomplishment").fill("Sorted the supply cabinet and labelled each shelf.");
  await dialog.locator('input[type="file"]').setInputFiles({ name: "cabinet.png", mimeType: "image/png", buffer: picture });
  await dialog.getByLabel("Caption for picture 1").fill("The cabinet, labelled");
  await dialog.getByRole("button", { name: "Time out", exact: true }).click();
  await expect(page.getByText(/Saved on this phone\..*Its picture waits with it\./)).toBeVisible();
  const panel = page.getByTestId("waiting-to-send");
  await expect(panel.getByRole("heading", { name: "Waiting to send (2)" })).toBeVisible();
  await expect(panel.getByTestId("waiting-step").filter({ hasText: "Pictures for the time-out (1)" })).toBeVisible();

  // The connection is back: the time-out goes first, then its picture.
  await context.setOffline(false);
  await expect(page.getByText("1 picture was added to your time-out.")).toBeVisible({ timeout: 30_000 });
  await expect(panel).toHaveCount(0);
  const kept = await api<{ attachments: { id: number; caption: string | null; mime_type: string; has_preview: boolean }[] }>(
    s.token, "GET", `/api/attachments?owner_type=attendance&owner_id=${s.log.id}`
  );
  expect(kept.body.attachments.map((item) => [item.caption, item.mime_type, item.has_preview])).toEqual([["The cabinet, labelled", "image/jpeg", true]]);
  // The preview is a WebP no more than 480 pixels on its long side.
  const preview = await page.evaluate(async ({ api, token, id }) => {
    const blob = await (await fetch(`${api}/api/attachments/${id}/preview`, { headers: { Authorization: `Bearer ${token}` } })).blob();
    const bitmap = await createImageBitmap(blob);
    return { type: blob.type, side: Math.max(bitmap.width, bitmap.height), bytes: blob.size };
  }, { api: API, token: s.token, id: kept.body.attachments[0].id });
  expect(preview.type).toBe("image/webp");
  expect(preview.side).toBe(480);
  expect(preview.bytes).toBeLessThan(200 * 1024);

  // The student's list loads the preview, not the picture; the picture opens on a tap.
  const previewLoaded = page.waitForResponse((response) => /\/api\/attachments\/\d+\/preview$/.test(response.url()));
  await page.goto("/daily-log");
  await previewLoaded;
  const wholeLoaded = page.waitForResponse((response) => /\/api\/attachments\/\d+\/file$/.test(response.url()));
  await page.getByRole("button", { name: "Open The cabinet, labelled" }).locator("visible=true").first().click();
  await wholeLoaded;
  await expect(page.getByRole("dialog").getByRole("img", { name: "The cabinet, labelled" })).toBeVisible();

  // The coordinator's record: the day panel shows the time-out's pictures.
  const coordinatorPage = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await signIn(coordinatorPage, "coordinator");
  await coordinatorPage.goto(`/coordinator/students/${encodeURIComponent(s.id)}`);
  await expect(coordinatorPage.getByRole("button", { name: "Open The cabinet, labelled" }).first()).toBeVisible({ timeout: 20_000 });
  await coordinatorPage.context().close();

  // The supervisor's month calendar: today's details show them too.
  const supervisorPage = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await signIn(supervisorPage, "supervisor");
  await supervisorPage.goto(`/supervisor/interns/${encodeURIComponent(s.id)}?tab=attendance`);
  await supervisorPage.locator('button[aria-current="date"]').first().click();
  await expect(supervisorPage.getByRole("dialog").getByRole("button", { name: "Open The cabinet, labelled" })).toBeVisible({ timeout: 20_000 });
  await supervisorPage.context().close();
});

test("a HEIC photo is refused with what to change on the phone, and nothing is sent", async ({ page }) => {
  const s = await freshStudent();
  await signIn(page, "student", s.account);
  await page.goto("/student/dashboard");
  await page.getByRole("button", { name: /^Time out/ }).locator("visible=true").first().click();
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  await dialog.locator('input[type="file"]').setInputFiles({ name: "IMG_0001.HEIC", mimeType: "image/heic", buffer: Buffer.from("ftypheic not really a picture") });
  await expect(dialog.getByText(/This browser cannot open a HEIC photo\. On an iPhone, open Settings, Camera, Formats and choose Most Compatible\. On Android/)).toBeVisible();
  await expect(dialog.getByLabel("Caption for picture 1")).toHaveCount(0);
});

test("the coordinator's ZIP: Include pictures asks for the pictures too", async ({ page }) => {
  const s = await freshStudent();
  // A picture on the new student's time-out note, sent the usual way.
  const form = new FormData();
  form.append("owner_type", "attendance");
  form.append("owner_id", String(s.log.id));
  form.append("file", new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9])], { type: "image/jpeg" }), "zip.jpg");
  expect((await fetch(`${API}/api/attachments`, { method: "POST", headers: { Authorization: `Bearer ${s.token}` }, body: form })).status).toBe(201);

  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, "coordinator");
  await page.goto("/coordinator/documents");
  const include = page.getByRole("checkbox", { name: "Include pictures" });
  await expect(include).not.toBeChecked();
  await include.check();
  const asked = page.waitForResponse((response) => response.url().includes("/api/coordinator/documents/zip"));
  await page.getByRole("button", { name: "Download as ZIP" }).click();
  const response = await asked;
  expect(new URL(response.url()).searchParams.get("include_pictures")).toBe("1");
  expect(response.status()).toBe(200);
});
