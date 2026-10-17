import { expect, test, type Page } from "@playwright/test";
import { FAKE_FACE_TRACKER } from "../camera/fake-face-tracker";
import { MARKER } from "../camera/test-card";
import { ACCOUNTS, API, api, apiSession, signIn, today } from "./helpers";

/*
|--------------------------------------------------------------------------
| THE TIME-IN PHOTO, THROUGH THE CAMERA CHECK
|--------------------------------------------------------------------------
|
| Runs in the "camera" project: the camera plays a test card with a red
| block near its left edge, and a stand-in face tracker turns its head as
| asked (see playwright.config.ts). Everything else is the app's own code.
|
| A new student is made for it, because a student times in once a day.
|
*/

/** How red the left and right edges of an image are (red minus the other two channels). */
async function redness(page: Page, source: { selector?: string; upload?: { path: string; token: string } }) {
  return page.evaluate(
    async ({ selector, upload, api, marker }) => {
      let bitmap: ImageBitmap;
      if (selector) {
        const image = document.querySelector(selector) as HTMLImageElement;
        await image.decode();
        bitmap = await createImageBitmap(image);
      } else {
        const name = upload!.path.split("/").pop();
        const response = await fetch(`${api}/api/uploads/${encodeURIComponent(name!)}`, {
          headers: { Authorization: `Bearer ${upload!.token}` },
        });
        bitmap = await createImageBitmap(await response.blob());
      }
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      const band = (from: number, to: number) => {
        const x = Math.round(from * bitmap.width);
        const y = Math.round(marker.top * bitmap.height);
        const { data } = context.getImageData(x, y, Math.round((to - from) * bitmap.width), Math.round((marker.bottom - marker.top) * bitmap.height));
        let sum = 0;
        for (let index = 0; index < data.length; index += 4) sum += data[index] - (data[index + 1] + data[index + 2]) / 2;
        return sum / (data.length / 4);
      };
      // The block's own place, and the same place seen in a mirror.
      return { left: band(marker.left, marker.right), right: band(1 - marker.right, 1 - marker.left) };
    },
    { ...source, api: API, marker: MARKER }
  );
}

test.describe("the time-in photo", () => {
  test("is taken with the button after the head turns, and is saved as the camera saw it, not mirrored", async ({ page }) => {
    // A student of the demo supervisor, signed in once to set a password and agree to the notice.
    const coordinator = await apiSession("coordinator");
    const supervisor = await apiSession("supervisor");
    const id = `CAM-${Date.now()}`;
    const email = `${id.toLowerCase()}@camera.test`;
    const made = await api(coordinator.token, "POST", "/api/coordinator/students", {
      student_id: id,
      email,
      password: "CameraStart123!",
      name: "Camera Check",
      supervisor_id: supervisor.id,
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const first = await (await fetch(`${API}/api/login/student`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "CameraStart123!" }),
    })).json();
    expect((await api(first.token, "PUT", `/api/students/${id}/password`, { current_password: "CameraStart123!", new_password: "CameraCheck456!" })).status).toBe(200);
    const signedIn = await (await fetch(`${API}/api/login/student`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "CameraCheck456!" }),
    })).json();
    const token = String(signedIn.token);
    const privacy = await api<{ notice: { version: string } }>(token, "GET", `/api/students/${id}/privacy`);
    expect((await api(token, "POST", `/api/students/${id}/privacy/consent`, { version: privacy.body.notice.version })).status).toBe(200);

    try {
      // The stand-in tracker is served where the app fetches MediaPipe's.
      await page.route(/\/assets\/vision_bundle-[^/]+\.js$/, (route) =>
        route.fulfill({ contentType: "application/javascript", body: FAKE_FACE_TRACKER })
      );
      await signIn(page, "student", { ...ACCOUNTS.student, email, password: "CameraCheck456!" });
      await page.getByRole("button", { name: /^Time in/ }).first().click();
      const dialog = page.getByRole("dialog", { name: "Time in" });

      // The preview is mirrored, as people expect while posing.
      const preview = dialog.getByLabel("Your camera");
      await expect(preview).toBeVisible();
      // (Tailwind's -scale-x-100 sets the scale property, not transform.)
      expect(await preview.evaluate((video) => getComputedStyle(video).scale)).toBe("-1 1");

      // After the head turns, the button waits; nothing is taken by itself.
      const shutter = dialog.getByRole("button", { name: "Take photo" });
      await expect(shutter).toBeVisible({ timeout: 30_000 });
      await page.evaluate(() => {
        (globalThis as { __fakeFaceHold?: boolean }).__fakeFaceHold = true;
      });
      await expect(shutter).toBeEnabled({ timeout: 10_000 });
      await expect(dialog.getByText("Ready when you are")).toBeVisible();
      await expect(dialog.getByRole("img", { name: "Your attendance photo" })).toHaveCount(0);
      // A 44-pixel target at least, centred at the bottom of the frame.
      const box = (await shutter.boundingBox())!;
      const frame = (await preview.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(Math.abs(box.x + box.width / 2 - (frame.x + frame.width / 2))).toBeLessThan(2);
      expect(frame.y + frame.height - (box.y + box.height)).toBeLessThan(40);
      await shutter.click();

      // The review shows the saved photo: the red block is on the left, where the camera put it.
      const review = dialog.getByRole("img", { name: "Your attendance photo" });
      await expect(review).toBeVisible();
      const shown = await redness(page, { selector: 'img[alt="Your attendance photo"]' });
      expect(shown.left, JSON.stringify(shown)).toBeGreaterThan(60);
      expect(shown.right, JSON.stringify(shown)).toBeLessThan(20);

      await dialog.getByRole("button", { name: "Confirm time-in" }).click();
      await expect(dialog).toBeHidden();

      // And so is the photo the server keeps.
      const logs = await api<{ attendance: { date: string; image_url: string | null; liveness_checks?: { level?: string } }[] }>(
        token, "GET", `/api/attendance/${id}`
      );
      const log = logs.body.attendance.find((entry) => entry.date === today());
      expect(log?.image_url).toBeTruthy();
      const stored = await redness(page, { upload: { path: log!.image_url!, token } });
      expect(stored.left, JSON.stringify(stored)).toBeGreaterThan(60);
      expect(stored.right, JSON.stringify(stored)).toBeLessThan(20);
    } finally {
      await api(coordinator.token, "PATCH", `/api/coordinator/students/${id}/status`, { is_active: false });
    }
  });
});

test.describe("a time-in with no connection", () => {
  test("runs the camera check with the day's voucher, waits on the phone with its photo, and arrives attested", async ({ page, context, browser }) => {
    const coordinator = await apiSession("coordinator");
    const supervisor = await apiSession("supervisor");
    const id = `OFF-${Date.now()}`;
    const email = `${id.toLowerCase()}@offline.test`;
    expect((await api(coordinator.token, "POST", "/api/coordinator/students", {
      student_id: id, email, password: "OfflineStart123!", name: "Offline Check", supervisor_id: supervisor.id,
    })).status).toBe(201);
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    expect((await api(coordinator.token, "PUT", `/api/coordinator/students/${id}/schedule`, {
      schedule: days.map((day) => ({ day, start_time: "08:00", end_time: "17:00" })),
    })).status).toBe(200);
    const login = async (password: string) =>
      (await (await fetch(`${API}/api/login/student`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
      })).json()).token as string;
    expect((await api(await login("OfflineStart123!"), "PUT", `/api/students/${id}/password`, { current_password: "OfflineStart123!", new_password: "OfflineCheck456!" })).status).toBe(200);
    const token = await login("OfflineCheck456!");
    const privacy = await api<{ notice: { version: string } }>(token, "GET", `/api/students/${id}/privacy`);
    expect((await api(token, "POST", `/api/students/${id}/privacy/consent`, { version: privacy.body.notice.version })).status).toBe(200);

    try {
      await page.route(/\/assets\/vision_bundle-[^/]+\.js$/, (route) =>
        route.fulfill({ contentType: "application/javascript", body: FAKE_FACE_TRACKER })
      );
      // Signing in gets the phone ready: a key, vouchers, and the face tracker loaded.
      const tracker = page.waitForRequest(/\/assets\/vision_bundle-[^/]+\.js$/);
      const issued = page.waitForResponse((response) => response.url().endsWith("/api/attendance/offline-vouchers") && response.status() === 200);
      await signIn(page, "student", { ...ACCOUNTS.student, email, password: "OfflineCheck456!" });
      const vouchers = (await (await issued).json()).vouchers as { date: string }[];
      await tracker;
      test.skip(vouchers[0]?.date !== today(), "Today is a holiday on this database, so no voucher is given for it.");

      // No connection: the check runs on the phone.
      await context.setOffline(true);
      await page.getByRole("button", { name: /^Time in/ }).first().click();
      const dialog = page.getByRole("dialog", { name: "Time in" });
      await expect(dialog).toContainText("the camera check runs on this phone");
      await expect(dialog.getByRole("button", { name: "Time in without a photo instead" })).toBeVisible();
      const shutter = dialog.getByRole("button", { name: "Take photo" });
      await expect(shutter).toBeVisible({ timeout: 30_000 });
      await page.evaluate(() => {
        (globalThis as { __fakeFaceHold?: boolean }).__fakeFaceHold = true;
      });
      await expect(shutter).toBeEnabled({ timeout: 10_000 });
      await shutter.click();
      await expect(dialog.getByRole("img", { name: "Your attendance photo" })).toBeVisible();
      await dialog.getByRole("button", { name: "Confirm time-in" }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText(/saved on this phone .*with its photo/i)).toBeVisible();

      // Nothing has reached the server yet.
      const logsToday = async () =>
        (await api<{ attendance: { date: string; image_url: string | null }[] }>(token, "GET", `/api/attendance/${id}`)).body.attendance.filter((entry) => entry.date === today());
      expect(await logsToday()).toHaveLength(0);

      // Back online: it is sent, with its photo, and the server checked it.
      await context.setOffline(false);
      await expect.poll(async () => (await logsToday()).length, { timeout: 30_000 }).toBe(1);
      const [log] = await logsToday();
      expect(log.image_url).toBeTruthy();
      const stored = await redness(page, { upload: { path: log.image_url!, token } });
      expect(stored.left, JSON.stringify(stored)).toBeGreaterThan(60);
      expect(stored.right, JSON.stringify(stored)).toBeLessThan(20);
      const review = await api<{ attendance: { student_id: string; offline_time_in: boolean; offline_attestation: { clock_moved: boolean } | null }[] }>(
        supervisor.token, "GET", `/api/supervisor/attendance/${supervisor.id}`
      );
      const entry = review.body.attendance.find((row) => row.student_id === id);
      expect(entry?.offline_time_in).toBe(true);
      expect(entry?.offline_attestation?.clock_moved).toBe(false);

      // The supervisor sees it marked, with its photo.
      const supervisorContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const supervisorPage = await supervisorContext.newPage();
      await signIn(supervisorPage, "supervisor");
      await supervisorPage.goto("/supervisor/attendance");
      // The mark on the log itself, not the filter chip of the same name.
      await expect(supervisorPage.locator("tbody").getByText("Offline · attested").locator("visible=true").first()).toBeVisible();
      await supervisorContext.close();
    } finally {
      await api(coordinator.token, "PATCH", `/api/coordinator/students/${id}/status`, { is_active: false });
    }
  });
});
