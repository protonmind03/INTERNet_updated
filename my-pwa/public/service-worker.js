const OFFLINE_CACHE = "internet-offline-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then((cache) => cache.add("/offline.html"))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Page loads always go to the network first, so a new build is never hidden
// behind a cached copy. Only when there is no connection is the offline page
// shown. Nothing else (scripts, API calls) is intercepted.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match("/offline.html"))
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    console.error("Invalid push notification payload.", error);
  }

  const title =
    typeof payload.title === "string" ? payload.title : "INTERNet";
  const options = {
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
      self.navigator.setAppBadge ? self.navigator.setAppBadge().catch(() => {}) : null,
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (self.navigator.clearAppBadge) self.navigator.clearAppBadge().catch(() => {});
  const target = new URL(event.notification.data?.url || "/", self.location.origin);
  if (target.origin !== self.location.origin) return;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => new URL(client.url).origin === target.origin);
      if (existing) {
        return existing.navigate(target.href).then(() => existing.focus());
      }
      return self.clients.openWindow(target.href);
    })
  );
});
