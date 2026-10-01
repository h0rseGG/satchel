// Service worker: network first, cache as offline fallback.
// - Online: every app file is re-checked with the server (cache: 'no-cache'
//   sends a conditional request; unchanged files come back as a cheap 304).
//   This stops browsers running a stale build from their HTTP cache.
// - Offline: serve the last copy we saw.
// Only same-origin GET requests are handled. Never touches IndexedDB.

const CACHE = 'satchel-v2';

self.addEventListener('install', () => self.skipWaiting());

// Deleting every other cache also clears v1's 'satchel-app-v1' on upgraded devices.
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
