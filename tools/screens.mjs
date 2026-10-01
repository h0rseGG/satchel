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
// A small world and a session in progress, for the capture screens.
const seedSession = async (opts = {}) => {
  const d = window.__satchel.data;
  if (await d.getMeta('bundle')) return;
  await d.createCharacter('Wren Ashdown');
  const { pc_entity_id } = await d.getMeta('bundle');
  await d.updateEntity(pc_entity_id, { profile: { concept: 'Exiled ranger looking for her missing sister', goals: 'Find Lyra. Pay off Grimbold.' }, dndbeyond_url: 'https://www.dndbeyond.com/characters' });
  const mk = (name, extra = {}) => d.createEntity({ name, type_id: 'type-npc', ...extra });
  await mk('Grimbold Ironhand', { summary: 'Dwarf smith and moneylender. 10% a week.' });
  await mk('Lord Aldric Thorne', { summary: 'Owns the mill. Hired us. Lying through his teeth.', tags: ['noble', 'fuck this guy', 'liar'] });
  await mk('Mira Vane', { aliases: ['The Fox'], tags: ['fence'] });
  await d.addNote('need money for gear. @Grimbold lends at 10% a WEEK?? took 20gp #debts');
  await d.setSession(true);
  for (const t of ['back to the mill. @Aldric pretends nothing happened #fuck_this_guy', '@Mira_Vane shows up. sells us a map of the barrow for 40gp', 'met a kid @Pip who sells info for sweets 🍬', 'paid @Grimbold 5gp #debts']) await d.addNote(t);
  if (opts.out) await d.setSession(false);
};
const type = (text) => async (page) => {
  const box = page.getByRole('combobox', { name: 'Note' });
  await box.click();
  await box.pressSequentially(text);
  await page.waitForTimeout(300);
};
const SCREENS = [
  { name: 'session-feed', hash: '#/', setup: seedSession },
  { name: 'session-suggest', hash: '#/', setup: seedSession, action: type('owes @gr') },
  { name: 'session-recall', hash: '#/', setup: seedSession, action: type('grimbold and lord aldric') },
  { name: 'session-stub', hash: '#/', setup: seedSession, action: type('pip again') },
  { name: 'session-overview', hash: '#/', setup: seedSession, action: (page) => page.locator('.topbar-home').click() },
  { name: 'home-box', hash: '#/', setup: seedSession, arg: { out: true } },
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
      await page.waitForLoadState('load');
      if (s.setup) {
        await page.waitForFunction(() => window.__satchel?.data);
        await page.evaluate(s.setup, s.arg ?? {});
        await page.reload();
        await page.waitForLoadState('load');
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300);
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
