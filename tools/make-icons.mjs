// Draws the app icon (a satchel in ink with a red wax-seal clasp) and renders the PNGs.
// Run: node tools/make-icons.mjs  (needs Playwright Firefox).
import { writeFileSync } from 'node:fs';
import { firefox } from '@playwright/test';

const C = { paper: '#F6F1E4', alt: '#EDE5D2', ink: '#3B3026', red: '#9C4A3A', hi: '#E2D3B0' };

// `scale` shrinks the drawing towards the centre: maskable icons must keep it
// inside the middle 80% because Android crops to a circle or squircle.
function svg({ scale = 1, corner = 96 } = {}) {
  const t = `translate(256 256) scale(${scale}) translate(-256 -256)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="${corner}" fill="${C.paper}"/>
  <g transform="${t}" stroke="${C.ink}" stroke-width="20" stroke-linejoin="round" stroke-linecap="round">
    <path d="M118 236 C118 52 394 52 394 236" fill="none"/>
    <rect x="90" y="196" width="332" height="244" rx="58" fill="${C.alt}"/>
    <path d="M90 240 Q90 196 134 196 H378 Q422 196 422 240 V292 C422 344 346 372 256 372 C166 372 90 344 90 292 Z" fill="${C.hi}"/>
    <circle cx="256" cy="366" r="34" fill="${C.red}" stroke="none"/>
    <circle cx="256" cy="366" r="18" fill="none" stroke="${C.paper}" stroke-width="6" opacity=".55"/>
  </g>
</svg>`;
}

const out = new URL('../icons/', import.meta.url);
writeFileSync(new URL('icon.svg', out), svg());

const browser = await firefox.launch();
const page = await browser.newPage();
// Draw on a canvas in the page rather than screenshotting: Playwright's Firefox
// can't take transparent-background screenshots, and the rounded corners need it.
async function png(file, size, opts) {
  const dataUrl = await page.evaluate(async ({ markup, size }) => {
    const img = new Image();
    img.src = `data:image/svg+xml,${encodeURIComponent(markup)}`;
    await img.decode();
    const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
    canvas.getContext('2d').drawImage(img, 0, 0, size, size);
    return canvas.toDataURL('image/png');
  }, { markup: svg(opts), size });
  writeFileSync(new URL(file, out), Buffer.from(dataUrl.split(',')[1], 'base64'));
}
await png('icon-32.png', 32);
await png('icon-192.png', 192);
await png('icon-512.png', 512);
await png('icon-maskable-512.png', 512, { scale: 0.78, corner: 0 });
await browser.close();
console.log('Icons written to icons/');
