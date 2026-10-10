import { toast } from "./toast";

/*
|--------------------------------------------------------------------------
| SERVICE WORKER: REGISTRATION AND UPDATES
|--------------------------------------------------------------------------
|
| The worker itself is src/service-worker.ts. This file registers it and
| handles a new version: the new worker installs in the background and
| waits, the person sees "Update available" with a Reload action, and only
| then does it take over. Nothing reloads by itself, so nobody loses what
| they were typing.
|
| The worker exists only in a built app (`npm run build`, then
| `npm run preview`, or the deployed site). `npm run dev` has none.
|
*/

const WORKER_URL = "/service-worker.js";
// Not more often than this, however many times the app is brought forward.
const CHECK_EVERY_MS = 15 * 60 * 1000;

let offered: ServiceWorker | null = null;
let reloadAsked = false;

function offerUpdate(waiting: ServiceWorker): void {
  // One offer per waiting worker, however many times it is noticed.
  if (offered === waiting) return;
  offered = waiting;
  toast.sticky("Update available. Reload to get the latest version.", {
    label: "Reload",
    onClick: () => {
      reloadAsked = true;
      waiting.postMessage({ type: "SKIP_WAITING" });
    },
  });
}

function watch(registration: ServiceWorkerRegistration): void {
  // A version that finished installing before this page opened.
  if (registration.waiting && navigator.serviceWorker.controller) {
    offerUpdate(registration.waiting);
  }

  registration.addEventListener("updatefound", () => {
    const incoming = registration.installing;
    if (!incoming) return;
    incoming.addEventListener("statechange", () => {
      // "installed" with a worker already in charge means an update; with
      // none, it is the very first install and there is nothing to offer.
      if (incoming.state === "installed" && navigator.serviceWorker.controller) {
        offerUpdate(incoming);
      }
    });
  });

  let lastCheck = Date.now();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !navigator.onLine) return;
    if (Date.now() - lastCheck < CHECK_EVERY_MS) return;
    lastCheck = Date.now();
    registration.update().catch(() => {});
  });
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  // The page reloads once, and only after Reload was pressed. The first
  // install also changes the controller, and must not reload anything.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!reloadAsked) return;
    reloadAsked = false;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(WORKER_URL)
      .then(watch)
      .catch((error) => {
        console.error("SERVICE WORKER REGISTRATION ERROR:", error);
      });
  });
}
