// Minimal service worker so the app is installable as a PWA.
// We deliberately do NOT cache API responses because the backend is the source of truth
// and stale job data would hurt more than it helps. Static assets get a network-first pass.
const CACHE = "repair-desk-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Never intercept API calls — always hit the network.
  if (req.url.includes("/api/")) return;
  if (req.method !== "GET") return;
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});
