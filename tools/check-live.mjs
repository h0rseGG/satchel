// After a push: waits for GitHub Pages to build this commit, then opens the live site in
// Firefox and checks it renders the expected version with no errors.
// Run: node tools/check-live.mjs
import { execFileSync } from 'node:child_process';
import { firefox } from '@playwright/test';
import { VERSION } from '../js/version.js';

const URL_LIVE = 'https://h0rsegg.github.io/satchel/';
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

for (let i = 0; ; i++) {
  const s = JSON.parse(execFileSync('gh', ['api', 'repos/h0rseGG/satchel/pages/builds/latest'], { encoding: 'utf8' }));
  if (s.status === 'built' && s.commit === head) break;
  if (s.status === 'errored') throw new Error('Pages build failed');
  if (i > 60) throw new Error('Pages build timed out');
  await new Promise((r) => setTimeout(r, 5000));
}

const browser = await firefox.launch();
const page = await browser.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
// Pages caches for up to 10 minutes; retry until the new version shows.
let version = '';
for (let i = 0; i < 24 && version !== `Satchel v${VERSION}`; i++) {
  problems.length = 0;
  await page.goto(`${URL_LIVE}?check=${Date.now()}`);
  try {
    await page.locator('.topbar-home').waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'Menu' }).click();
    version = (await page.locator('.menu-version').textContent()).trim();
  } catch { version = '(did not render)'; }
  if (version !== `Satchel v${VERSION}`) await new Promise((r) => setTimeout(r, 25000));
}
await browser.close();
console.log(`live: ${version}; expected Satchel v${VERSION}; problems: ${problems.length ? problems.join(' | ') : 'none'}`);
if (version !== `Satchel v${VERSION}` || problems.length) process.exit(1);
