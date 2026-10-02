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
    badge: "/favicon-32.png",
    data: {
      url: typeof payload.url === "string" ? payload.url : "/",
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
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
