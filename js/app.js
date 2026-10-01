// Entry point: check the environment, open the database, render the app.
import { render } from 'preact';
import { html } from './ui/html.js';
import { App } from './ui/App.js';
import { db } from './db.js';

const root = document.getElementById('app');

function fatal(message) {
  root.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'badge badge--err fatal';
  p.textContent = message;
  root.append(p);
}

// Fit the app to the visible area, which shrinks when the on-screen keyboard
// opens. Skipped while pinch-zoomed, so zooming doesn't squash the layout.
function fitToVisibleArea() {
  const vv = window.visualViewport;
  if (!vv) return;
  const fit = () => {
    if (Math.abs(vv.scale - 1) > 0.01) return;
    document.documentElement.style.setProperty('--app-height', `${vv.height}px`);
    // The browser may have scrolled the page to reveal the box; undo that.
    window.scrollTo(0, 0);
  };
  vv.addEventListener('resize', fit);
  fit();
}

async function start() {
  fitToVisibleArea();
  // crypto.randomUUID and the service worker need HTTPS or localhost.
  if (!window.isSecureContext) {
    fatal('Not a secure context. Open via https:// or run "python -m http.server" and use http://localhost.');
    return;
  }
  try {
    await db.open();
  } catch (err) {
    fatal(`Can't open the browser database: ${err.message}`);
    return;
  }
  // Test hook: lets browser tests inspect the database. Local dev only.
  if (location.hostname === 'localhost') window.__satchel = { db };
  root.innerHTML = '';
  render(html`<${App} />`, root);
}

// Service worker (sw.js): always load the latest build when online, the
// last-seen build when offline. Relative path so it works under /satchel/.
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker not registered', err));
}

start();
registerServiceWorker();
