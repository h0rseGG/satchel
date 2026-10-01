// Screenshots every screen at desktop and phone width for visual review.
// Run: node tools/screens.mjs  (serves the app itself on port 8124). Output: screens/ (git-ignored).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { firefox } from '@playwright/test';

const PORT = 8124;
const SCREENS = [
  { name: 'frame', hash: '#/' },
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
    const page = await browser.newPage({ viewport: { width: w.width, height: w.height } });
    for (const s of SCREENS) {
      await page.goto(`http://localhost:${PORT}/${s.hash}`);
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      const file = `${out}${s.name}-${w.label}.png`;
      await page.screenshot({ path: file, fullPage: true });
      console.log(file);
    }
    await page.close();
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
