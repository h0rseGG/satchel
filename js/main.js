import { render } from 'preact';
import { html } from './ui/html.js';
import { App } from './ui/app/App.js';

render(html`<${App} />`, document.getElementById('app'));

// Network-first service worker (sw.js): latest build online, last seen build offline.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker not registered:', err));
}
