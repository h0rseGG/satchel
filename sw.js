// Service worker: network first, cache as offline fallback.
// - Online: every app file is re-checked with the server (cache: 'no-cache'
//   sends a conditional request; unchanged files come back as a cheap 304).
//   This stops browsers running a stale build from their HTTP cache.
// - Offline: serve the last copy we saw.
// Only same-origin GET requests are handled; anything else (e.g. the
// GitHub API for sync) goes straight to the network untouched.
// Never touches IndexedDB, so it can't affect your data.

const CACHE = 'satchel-app-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) await cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      throw new Error(`Offline and not cached: ${req.url}`);
    }
  })());
});
