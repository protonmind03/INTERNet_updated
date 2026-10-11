import { defineConfig } from "@playwright/test";

/*
|--------------------------------------------------------------------------
| END-TO-END TESTS
|--------------------------------------------------------------------------
|
| A real browser drives the built app against a local API with the demo
| accounts (npm run db:seed-demo in backend). Nothing here starts the two
| servers: CI starts them (see .github/workflows/ci.yml), and locally they
| are started by hand:
|
|   backend:   npm run dev                        (API on its usual port)
|   my-pwa:    npm run build && npm run preview   (site on port 4173)
|   e2e:       npm test
|
| E2E_BASE_URL and E2E_API_URL say where they are when not on the defaults.
| The tests write records (a journal, a holiday), so they refuse to run
| against anything that is not this machine.
|
| The camera is a fake one the browser provides. It has no face in it, so
| the time-in test goes as far as the camera check starting, not through
| it: a complete time-in cannot be automated.
|
*/

const baseURL = process.env.E2E_BASE_URL || "http://localhost:4173";

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(baseURL)) {
  throw new Error("End-to-end tests run only against this machine (E2E_BASE_URL must be localhost).");
}

export default defineConfig({
  testDir: "./tests",
  // The tests share the demo accounts and each other's records.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    // A phone: the size students use.
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    // CI downloads Chromium; locally the installed Chrome is used.
    channel: process.env.CI ? undefined : "chrome",
    permissions: ["camera"],
    launchOptions: {
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
