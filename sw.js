// Service worker: network first, cache as offline fallback.
// - Install: pre-caches every app file, so the app opens offline after one visit
//   (files loaded before the worker took control, or from the browser's memory cache,
//   never pass through it otherwise).
// - Online: every app file is re-checked with the server (cache: 'no-cache' sends a
//   conditional request; unchanged files come back as a cheap 304). This stops browsers
//   running a stale build from their HTTP cache.
// - Offline: serve the last copy we saw.
// Only same-origin GET requests are handled. Never touches IndexedDB.

const CACHE = 'satchel-v2';

// BEGIN FILES (written by tools/sw-files.mjs)
const FILES = [
  "./",
  "css/components.css",
  "css/screens.css",
  "css/tokens.css",
  "demo/wren.kit",
  "icons/icon-192.png",
  "icons/icon-32.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/icon.svg",
  "index.html",
  "js/core/backup.js",
  "js/core/dates.js",
  "js/core/files-rules.js",
  "js/core/json.js",
  "js/core/kit.js",
  "js/core/mentions.js",
  "js/core/merge.js",
  "js/core/model.js",
  "js/core/relationships.js",
  "js/core/search.js",
  "js/core/session.js",
  "js/core/shortnames.js",
  "js/core/tags.js",
  "js/core/text.js",
  "js/core/types.js",
  "js/data/capture.js",
  "js/data/characters.js",
  "js/data/db.js",
  "js/data/entities.js",
  "js/data/files.js",
  "js/data/frame.js",
  "js/data/inbox.js",
  "js/data/live.js",
  "js/data/meta.js",
  "js/data/notes.js",
  "js/data/recall.js",
  "js/data/relationships.js",
  "js/data/session.js",
  "js/data/store.js",
  "js/data/types.js",
  "js/main.js",
  "js/ui/app/App.js",
  "js/ui/app/ConfirmHost.js",
  "js/ui/app/Toasts.js",
  "js/ui/app/TopBar.js",
  "js/ui/app/confirm.js",
  "js/ui/app/router.js",
  "js/ui/app/routes.js",
  "js/ui/app/toasts.js",
  "js/ui/components/Button.js",
  "js/ui/components/CaptureBox.js",
  "js/ui/components/Card.js",
  "js/ui/components/ChipsField.js",
  "js/ui/components/Connections.js",
  "js/ui/components/DndBeyondButton.js",
  "js/ui/components/EntityPicker.js",
  "js/ui/components/Field.js",
  "js/ui/components/InlineForm.js",
  "js/ui/components/LinkField.js",
  "js/ui/components/ListRow.js",
  "js/ui/components/NoteRow.js",
  "js/ui/components/NoteText.js",
  "js/ui/components/Panel.js",
  "js/ui/components/Portrait.js",
  "js/ui/components/RecallStack.js",
  "js/ui/components/Relationships.js",
  "js/ui/components/Select.js",
  "js/ui/components/Sheet.js",
  "js/ui/components/Thumb.js",
  "js/ui/dev.js",
  "js/ui/format.js",
  "js/ui/html.js",
  "js/ui/screens/Character.js",
  "js/ui/screens/Entity.js",
  "js/ui/screens/EntityFields.js",
  "js/ui/screens/FirstRun.js",
  "js/ui/screens/Gallery.js",
  "js/ui/screens/Home.js",
  "js/ui/screens/Inbox.js",
  "js/ui/screens/NotBuilt.js",
  "js/ui/screens/Notes.js",
  "js/ui/screens/Overview.js",
  "js/ui/screens/Session.js",
  "js/ui/screens/TypeList.js",
  "js/ui/screens/TypeManager.js",
  "js/ui/screens/World.js",
  "js/ui/strings.js",
  "js/ui/tap.js",
  "js/ui/useBlobUrl.js",
  "js/ui/useCapture.js",
  "js/ui/useLive.js",
  "js/version.js",
  "manifest.webmanifest",
  "vendor/dexie.mjs",
  "vendor/fflate.mjs",
  "vendor/fonts/im-fell-english-sc.woff2",
  "vendor/fonts/im-fell-english.woff2",
  "vendor/htm.mjs",
  "vendor/minisearch.mjs",
  "vendor/preact-hooks.mjs",
  "vendor/preact.mjs"
];
// END FILES

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES.map((f) => new Request(f, { cache: 'no-cache' })));
    await self.skipWaiting();
  })());
});

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
