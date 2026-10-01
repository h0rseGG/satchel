import { render } from 'preact';
import { html } from './ui/html.js';
import { App } from './ui/app/App.js';
import { isDev } from './ui/dev.js';
import { reportError } from './ui/app/toasts.js';

if (isDev) {
  // Tests read and seed the database through this (localhost only).
  Promise.all([import('./data/db.js'), import('./data/characters.js'), import('./data/notes.js'), import('./data/entities.js'), import('./data/store.js'), import('./data/meta.js'), import('./data/session.js'), import('./data/types.js'), import('./data/relationships.js')])
    .then(([dbm, characters, notes, entities, store, meta, session, types, rels]) => {
      window.__satchel = { db: dbm.db(), data: { ...characters, ...notes, ...entities, ...store, ...meta, ...session, ...types, ...rels } };
    });
}

// Anything that slips through still gets a message, never a silent failure (SPEC 10).
// Only the app's own scripts: errors from browser extensions aren't ours to report.
window.addEventListener('error', (e) => {
  if (!e.filename || new URL(e.filename, location.href).origin === location.origin) reportError(e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => reportError(e.reason));

render(html`<${App} />`, document.getElementById('app'));

// Network-first service worker (sw.js): latest build online, last seen build offline.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker not registered:', err));
}
