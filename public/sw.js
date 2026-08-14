const CACHE_NAME = "prestige-tiles-v1";
const OFFLINE_URL = "/offline";

const ASSETS_TO_CACHE = [
  OFFLINE_URL,
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Bypass cache for APIs, Next actions, and non-GET requests (inventory mutations)
  if (
    req.method !== "GET" || 
    url.pathname.startsWith("/api") || 
    url.pathname.includes("/_next/data") ||
    req.headers.get("x-nextjs-data")
  ) {
    event.respondWith(fetch(req));
    return;
  }

  // Handle page navigations
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => {
        return caches.match(OFFLINE_URL) || new Response("Offline mode", { status: 503 });
      })
    );
    return;
  }

  // Static assets caching (Cache-First)
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(req).then((networkResponse) => {
        // Cache NextJS static script/css chunks and icon assets
        if (
          networkResponse.status === 200 &&
          (url.pathname.startsWith("/_next/static") || url.pathname.startsWith("/icons"))
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, responseToCache);
          });
        }
        return networkResponse;
      });
    })
  );
});

// Push Notifications handler
self.addEventListener("push", (event) => {
  try {
    const data = event.data ? event.data.json() : {};
    const title = data.title || "Prestige Tiles Alert";
    const options = {
      body: data.body || "You have a new update in your portal.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: data.data || {},
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error("Error receiving push event:", err);
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});
