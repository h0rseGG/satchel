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

async function start() {
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

start();
