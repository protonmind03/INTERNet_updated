import { expect, test } from "@playwright/test";
import { signIn, openProfileGroup } from "./helpers";

/*
|--------------------------------------------------------------------------
| THE FACE-TRACKING FILES ARE ON THE PHONE BEFORE THEY ARE NEEDED
|--------------------------------------------------------------------------
|
| A time-in with no connection needs them, so a student's sign-in fetches
| them into the service worker's caches (my-pwa lib/liveness/trackerFiles.ts,
| whose cache names are repeated here).
|
*/

test("signing in as a student puts the face-tracking files in the phone's caches", async ({ page }) => {
  await signIn(page, "student");
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const kept = [
            ...(await (await caches.open("mediapipe-0.10.14")).keys()),
            ...(await (await caches.open("models-v1")).keys()),
          ].map((request) => new URL(request.url).pathname);
          return (
            kept.some((name) => /^\/mediapipe\/wasm\/vision_wasm(_nosimd)?_internal\.wasm$/.test(name)) &&
            kept.some((name) => /^\/mediapipe\/wasm\/vision_wasm(_nosimd)?_internal\.js$/.test(name)) &&
            kept.includes("/models/face_landmarker.task")
          );
        }),
      { timeout: 60_000 }
    )
    .toBe(true);
});

test("the Profile says when this phone is ready to time in with a photo and no signal", async ({ page }) => {
  await signIn(page, "student");
  await page.goto("/profile");
  await openProfileGroup(page, "Security and device");
  const card = page.getByRole("heading", { name: "Timing in with no signal" }).locator("..");
  await expect(card).toBeVisible();
  // The demo student has scheduled days ahead, so once the files are kept it is ready.
  await expect(card.getByRole("status")).toContainText("Ready.", { timeout: 60_000 });
  await expect(card.getByRole("status")).toContainText("With no signal, you can still time in with your photo");
});
