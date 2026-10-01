import { test, expect } from '@playwright/test';
import { newCharacter, noSidewaysScroll } from './helpers.js';

test('first run names the character; Home shows it', async ({ page }) => {
  await newCharacter(page, 'Wren Ashdown');
  await expect(page.locator('.page-title')).toHaveText('Wren Ashdown');
  await page.reload();
  await expect(page.locator('.topbar-home')).toHaveText('Wren Ashdown');
});

test('breadcrumbs follow the address; back button works', async ({ page }) => {
  await newCharacter(page);
  const crumbs = page.locator('.topbar-crumbs');
  await page.goto('/#/world/type-npc');
  await expect(crumbs).toHaveText('Home › World › NPCs');
  await page.goto('/#/inbox');
  await expect(crumbs).toHaveText('Home › Inbox');
  await page.goBack();
  await expect(crumbs).toHaveText('Home › World › NPCs');
  await crumbs.getByRole('link', { name: 'World' }).click();
  await expect(page).toHaveURL(/#\/world$/);
  await expect(crumbs).toHaveText('Home › World');
});

test('entity crumbs show its type and current name; stubs sit under Stubs', async ({ page }) => {
  await newCharacter(page);
  const ids = await page.evaluate(async () => {
    const d = window.__satchel.data;
    const n = await d.addNote('met @Grimbold_Ironhand and @Pip');
    const g = n.mentions[0];
    await d.updateEntity(g, { type_id: 'type-npc', stub: false });
    return n.mentions;
  });
  const crumbs = page.locator('.topbar-crumbs');
  await page.goto(`/#/entity/${ids[0]}`);
  await expect(crumbs).toHaveText('Home › World › NPCs › Grimbold Ironhand');
  await page.evaluate((id) => window.__satchel.data.updateEntity(id, { name: 'Grimbold the Bold' }), ids[0]);
  await expect(crumbs).toHaveText('Home › World › NPCs › Grimbold the Bold');
  await page.goto(`/#/entity/${ids[1]}`);
  await expect(crumbs).toHaveText('Home › World › Stubs › Pip');
});

test('opening a deep link directly shows the right page (router reads the address on start)', async ({ page }) => {
  await newCharacter(page);
  await page.goto('/#/settings');
  await page.reload();
  await expect(page.locator('.topbar-crumbs')).toHaveText('Home › Settings');
  await expect(page.locator('.page-title')).toHaveText('Settings');
});

test('phone: bar on one line, crumbs on their own line, short labels', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 860 });
  await newCharacter(page, 'Wren Ashdown of the Long Marsh Road');
  await page.goto('/#/world/type-npc');
  const bar = await page.locator('.topbar').boundingBox();
  expect(bar.height).toBeLessThan(56);
  await expect(page.locator('.crumbline')).toBeVisible();
  await expect(page.locator('.crumbline')).toHaveText('Home › World › NPCs');
  await expect(page.locator('.topbar-crumbs')).toBeHidden();
  await expect(page.locator('.session-btn')).toHaveText('Session', { useInnerText: true });
  const home = page.locator('.topbar-home');
  expect(await home.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await noSidewaysScroll(page)).toBe(true);
});

test('session button toggles and survives a reload', async ({ page }) => {
  await newCharacter(page);
  const btn = page.locator('.session-btn');
  await expect(btn).toHaveText('Start session', { useInnerText: true });
  await btn.click();
  await expect(btn).toHaveText('In session', { useInnerText: true });
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('.session-btn')).toHaveText('In session', { useInnerText: true });
});

test('backup badge: red until backed up; counts changes; same value is a no-op; merges do not count', async ({ page }) => {
  await newCharacter(page);
  const badge = page.locator('.badge');
  await expect(badge).toHaveText('Not backed up');
  await expect(badge).toHaveClass(/badge-err/);
  const pcId = await page.evaluate(async () => (await window.__satchel.data.getMeta('bundle')).pc_entity_id);
  await page.evaluate(() => window.__satchel.data.addNote('first note'));
  await expect(badge).toHaveText('1 change since backup');
  await page.evaluate((id) => window.__satchel.data.updateEntity(id, { name: 'Wren Ashdown' }), pcId);
  await page.evaluate(async (id) => {
    const d = window.__satchel.data;
    const e = await d.getRecord('entities', id);
    await d.save('entities', { ...e, summary: 'merged in', updated_at: new Date().toISOString() }, { countAsChange: false });
  }, pcId);
  await page.waitForTimeout(200);
  await expect(badge).toHaveText('1 change since backup');
  await page.evaluate(async () => window.__satchel.data.setMeta('backup', { last_backup_at: new Date().toISOString(), changes_since_backup: 0, first_change_at: null }));
  await expect(badge).toHaveText('Backed up');
  await expect(badge).toHaveClass(/badge-ok/);
});

test('notes: @mentions make stubs, editing keeps the first version', async ({ page }) => {
  await newCharacter(page);
  const out = await page.evaluate(async () => {
    const d = window.__satchel.data;
    const n = await d.addNote('paid @Grimbold back #debts');
    const form = await d.editForm(n.id);
    const e = await d.editNote(n.id, `${form.text} in full`, { picks: form.picks });
    const all = await window.__satchel.db.entities.toArray();
    return { n, e, form, stubs: all.filter((x) => x.stub).map((x) => x.name) };
  });
  expect(out.stubs).toEqual(['Grimbold']);
  expect(out.n.tags).toEqual(['debts']);
  expect(out.n.mode).toBe('out');
  expect(out.form.text).toBe('paid @Grimbold back #debts');
  expect(out.e.original_text).toBe(out.n.text);
  expect(out.e.mentions).toEqual(out.n.mentions);
});
