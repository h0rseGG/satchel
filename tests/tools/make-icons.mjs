// Draws the app icons (a satchel, palette colours only) in Playwright's
// Firefox and writes PNGs to icons/.
//   node tests/tools/make-icons.mjs
import { writeFile, mkdir } from 'node:fs/promises';
import { firefox } from '@playwright/test';

const SIZES = [
  ['icon-32.png', 32, 0],
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['icon-maskable-512.png', 512, 0.12],   // safe-zone padding for round masks
];

await mkdir(new URL('../../icons/', import.meta.url), { recursive: true });
const browser = await firefox.launch();
const page = await browser.newPage();

for (const [file, size, pad] of SIZES) {
  const b64 = await page.evaluate(([size, pad]) => {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    const s = size * (1 - pad * 2);       // drawing area
    const o = size * pad;                 // offset
    const u = (v) => o + v * s;           // 0..1 -> pixels
    // Background: rounded square in the light panel colour.
    g.fillStyle = '#E6E6E1';
    g.fillRect(0, 0, size, size);
    // Bag body.
    g.fillStyle = '#4A4A4A';
    const r = s * 0.06;
    g.beginPath();
    g.moveTo(u(0.16) + r, u(0.36));
    g.lineTo(u(0.84) - r, u(0.36));
    g.quadraticCurveTo(u(0.84), u(0.36), u(0.84), u(0.36) + r);
    g.lineTo(u(0.84), u(0.84) - r);
    g.quadraticCurveTo(u(0.84), u(0.84), u(0.84) - r, u(0.84));
    g.lineTo(u(0.16) + r, u(0.84));
    g.quadraticCurveTo(u(0.16), u(0.84), u(0.16), u(0.84) - r);
    g.lineTo(u(0.16), u(0.36) + r);
    g.quadraticCurveTo(u(0.16), u(0.36), u(0.16) + r, u(0.36));
    g.fill();
    // Strap.
    g.strokeStyle = '#4A4A4A';
    g.lineWidth = Math.max(2, s * 0.07);
    g.beginPath();
    g.arc(u(0.5), u(0.36), s * 0.2, Math.PI, 0);
    g.stroke();
    // Flap.
    g.fillStyle = '#B8D8C0';
    g.beginPath();
    g.moveTo(u(0.16), u(0.36));
    g.lineTo(u(0.84), u(0.36));
    g.lineTo(u(0.84), u(0.52));
    g.lineTo(u(0.5), u(0.64));
    g.lineTo(u(0.16), u(0.52));
    g.closePath();
    g.fill();
    // Buckle.
    g.fillStyle = '#E6CFA1';
    g.fillRect(u(0.45), u(0.58), s * 0.1, s * 0.1);
    return c.toDataURL('image/png').split(',')[1];
  }, [size, pad]);
  await writeFile(new URL(`../../icons/${file}`, import.meta.url), Buffer.from(b64, 'base64'));
  console.log('wrote', file);
}
await browser.close();
