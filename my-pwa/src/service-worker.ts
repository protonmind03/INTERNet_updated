/// <reference lib="webworker" />
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { MEDIAPIPE_CACHE, MODELS_CACHE } from "./lib/liveness/trackerFiles";

/*
|--------------------------------------------------------------------------
| SERVICE WORKER
|--------------------------------------------------------------------------
|
| Built by vite-plugin-pwa into /service-worker.js. It does four things:
|
| 1. Keeps a copy of the app itself (scripts, styles, icons, the sign-in
|    font) so the app opens with no connection.
| 2. Keeps the face-tracking files; they are large and never change within
|    a version. A student's phone puts them here at sign-in
|    (lib/liveness/trackerFiles.ts), so the camera check works offline.
| 3. Shows push notifications and opens the right page when one is tapped.
| 4. Waits to take over until the person agrees to the update.
|
| It never touches a request to the API. Records are personal; what the
| app may keep for offline reading is decided in lib/offlineStore.ts, per
| account, and is erased at sign-out. Nothing here stores an API answer.
|
*/

declare const self: ServiceWorkerGlobalScope;

// The cache names live in lib/liveness/trackerFiles.ts, shared with the app.
const VERSIONED_PREFIXES = ["mediapipe-", "models-", "psu-marks-"];
// The cache the hand-written worker used before this one.
const LEGACY_CACHES = ["internet-offline-v1"];
// The PSU marks at full size, kept once shown. Its name moves with a new set of marks.
const PSU_MARKS_CACHE = "psu-marks-v1";

const NAVIGATION_TIMEOUT_MS = 6000;

/*
|--------------------------------------------------------------------------
| PAGE LOADS
|--------------------------------------------------------------------------
|
| Always the network first, so a published update is never hidden behind a
| saved copy. With no connection (or one too slow to answer in time) the
| saved app opens instead, and shows whatever it kept for offline reading.
| The plain offline page is the last resort.
|
*/

async function loadPage(request: Request): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT_MS);
  try {
    return await fetch(request, { signal: controller.signal });
  } catch {
    // Iteration 23: "/" is the landing page (index.html) and the role pages
    // are their own files (for-trainees.html…); every other address is the
    // app (app.html). None is answered with another.
    const pathname = new URL(request.url).pathname.replace(/(.)\/$/, "$1");
    const page =
      pathname === "/"
        ? "/index.html"
        : /^\/for-(trainees|supervisors|coordinators)$/.test(pathname)
          ? `${pathname}.html`
          : "/app.html";
    return (
      (await matchPrecache(page)) ??
      (await matchPrecache("/offline.html")) ??
      Response.error()
    );
  } finally {
    clearTimeout(timer);
  }
}

// Registered before the saved files below, so "/" is not answered from them.
registerRoute(
  new NavigationRoute(({ request }) => loadPage(request), {
    // Never the API (it shares this address only in local phone testing).
    denylist: [/^\/api\//],
  })
);

/*
|--------------------------------------------------------------------------
| THE APP'S OWN FILES
|--------------------------------------------------------------------------
*/

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST, { cleanURLs: false });

/*
|--------------------------------------------------------------------------
| FACE-TRACKING FILES
|--------------------------------------------------------------------------
*/

registerRoute(
  ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/mediapipe/"),
  new CacheFirst({ cacheName: MEDIAPIPE_CACHE })
);
registerRoute(
  ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/models/"),
  new CacheFirst({ cacheName: MODELS_CACHE })
);

/*
| The PSU marks at full size (internet-revisions, Section 2): not in the
| install, kept once shown. The 128 px copies and the seal are precached.
*/
registerRoute(
  ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/brand/psu/"),
  new CacheFirst({ cacheName: PSU_MARKS_CACHE })
);

/*
|--------------------------------------------------------------------------
| TAKING OVER
|--------------------------------------------------------------------------
|
| A new version installs in the background and then waits. The app shows
| "Update available"; pressing Reload sends SKIP_WAITING, the new worker
| takes over and the page reloads once. Nobody's page changes under them.
|
*/

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const current = new Set([MEDIAPIPE_CACHE, MODELS_CACHE, PSU_MARKS_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) =>
              LEGACY_CACHES.includes(name) ||
              (VERSIONED_PREFIXES.some((prefix) => name.startsWith(prefix)) &&
                !current.has(name))
          )
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

/*
|--------------------------------------------------------------------------
| PUSH NOTIFICATIONS
|--------------------------------------------------------------------------
*/

type BadgeNavigator = WorkerNavigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};
const badge = self.navigator as BadgeNavigator;

self.addEventListener("push", (event) => {
  let payload: { title?: unknown; body?: unknown; url?: unknown } = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    console.error("Invalid push notification payload.", error);
  }

  const title = typeof payload.title === "string" ? payload.title : "INTERNet";
  const options: NotificationOptions = {
    body: typeof payload.body === "string" ? payload.body : "",
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    data: {
      url: typeof payload.url === "string" ? payload.url : "/",
    },
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      // The dot on the installed app's icon, where the device supports it.
      badge.setAppBadge ? badge.setAppBadge().catch(() => {}) : null,
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (badge.clearAppBadge) badge.clearAppBadge().catch(() => {});
  const target = new URL(event.notification.data?.url || "/", self.location.origin);
  if (target.origin !== self.location.origin) return;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => new URL(client.url).origin === target.origin);
      if (existing) {
        return existing.navigate(target.href).then((client) => client?.focus());
      }
      return self.clients.openWindow(target.href);
    })
  );
});
