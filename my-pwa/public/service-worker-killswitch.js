/*
 * KILL SWITCH. Not used in normal operation.
 *
 * If a published service worker ever misbehaves (people stuck on an old
 * version, pages failing to load), copy this file over the built
 * service-worker.js and publish. Every device then replaces its worker with
 * this one, which deletes everything the old worker stored, removes itself,
 * and reloads the open pages from the network. The steps are in DEPLOY.md
 * under "If the service worker goes wrong".
 *
 * It stores nothing and answers no request.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) client.navigate(client.url);
    })()
  );
});
