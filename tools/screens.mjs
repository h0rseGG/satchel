// Screenshots every screen at desktop and phone width for visual review.
// Run: node tools/screens.mjs  (serves the app itself on port 8124). Output: screens/ (git-ignored).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { firefox } from '@playwright/test';

const PORT = 8124;
// Each screen: an address, plus optional setup (runs in the page) and an action before the shot.
const seed = async () => {
  const d = window.__satchel.data;
  if (!(await d.getMeta('bundle'))) await d.createCharacter('Wren Ashdown');
};
const SCREENS = [
  { name: 'first-run', hash: '#/' },
  { name: 'gallery', hash: '#/dev/gallery', height: 3200 },
  { name: 'home', hash: '#/', setup: seed },
  { name: 'crumbs', hash: '#/world/type-npc', setup: seed },
  { name: 'menu', hash: '#/', setup: seed, action: (page) => page.getByRole('button', { name: 'Menu' }).click() },
  { name: 'sheet', hash: '#/dev/gallery', action: (page) => page.getByRole('button', { name: 'Confirm with name' }).click() },
];
const WIDTHS = [{ label: 'desktop', width: 1280, height: 800 }, { label: 'phone', width: 412, height: 860 }];

const root = new URL('../', import.meta.url).pathname;
const out = new URL('../screens/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: root, stdio: 'ignore' });
try {
  await waitForServer(`http://localhost:${PORT}/`);
  const browser = await firefox.launch();
  for (const w of WIDTHS) {
    for (const s of SCREENS) {
      // A fresh context per screen, so first-run really is empty.
      const context = await browser.newContext({ viewport: { width: w.width, height: s.height ?? w.height } });
      const page = await context.newPage();
      await page.goto(`http://localhost:${PORT}/${s.hash}`);
      await page.waitForLoadState('networkidle');
      if (s.setup) {
        await page.waitForFunction(() => window.__satchel?.data);
        await page.evaluate(s.setup);
        await page.reload();
        await page.waitForLoadState('networkidle');
      }
      if (s.action) await s.action(page);
      await page.evaluate(() => document.fonts.ready);
      const file = `${out}${s.name}-${w.label}.png`;
      await page.waitForTimeout(150);
      await page.screenshot({ path: file });
      console.log(file);
      await context.close();
    }
  }
  await browser.close();
} finally {
  server.kill();
}

async function waitForServer(url) {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Server didn't start: ${url}`);
}
