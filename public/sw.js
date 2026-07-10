const TAPZY_CACHE = "tapzy-static-v12";
const STATIC_ASSETS = [
  "/js/tapzy-performance.js",
  "/images/tapzy-logo-white.png",
  "/images/tapzy-mark-white.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(TAPZY_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== TAPZY_CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/uploads/")) {
    event.respondWith(
      caches.open(TAPZY_CACHE).then((cache) => cache.match(req).then((cached) => {
        return cached || fetch(req).then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        });
      }))
    );
    return;
  }

  if (/^\/(?:js|images)\//.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(TAPZY_CACHE).then((cache) => cache.put(req, copy));
        return res;
      }))
    );
  }
});


self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = {}; }
  const title = data.title || "Tapzy";
  const options = {
    body: data.body || "You have a new update",
    icon: data.icon || "/favicon.ico",
    badge: "/favicon.ico",
    tag: data.tag || "tapzy-notification",
    data: { url: data.url || "/notifications" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification && event.notification.data && event.notification.data.url) || "/notifications";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
    for (const client of clientList) {
      if (client.url && client.focus) {
        client.navigate(url);
        return client.focus();
      }
    }
    return clients.openWindow(url);
  }));
});
