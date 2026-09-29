// Push-only service worker: it wakes up when the server sends a notification
// and shows it, even with the app closed. It deliberately caches nothing, so
// it can never serve a stale copy of the app.

// Some browsers only treat a site as installable when its service worker has a
// fetch handler. This one does nothing (every request goes straight to the
// network), so it still can't serve a stale copy; modern browsers skip an
// empty handler entirely, so it costs nothing.
self.addEventListener("fetch", () => {});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  // Always show something: iOS revokes a subscription whose pushes don't
  // produce a visible notification.
  event.waitUntil(
    self.registration.showNotification(data.title || "Ibirifas", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // Only ever navigate within this site, whatever the payload says.
  let target = new URL("/", self.location.origin);
  try {
    const requested = new URL(event.notification.data && event.notification.data.url ? event.notification.data.url : "/", self.location.origin);
    if (requested.origin === self.location.origin) target = requested;
  } catch {
    // Keep the home page.
  }

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        // Bringing the window forward can be refused; that must not stop us
        // from taking the person to what the notification was about.
        await open.focus().catch(() => {});
        if (open.url !== target.href && "navigate" in open) {
          await open.navigate(target.href).catch(() => {});
        }
        return;
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
