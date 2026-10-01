// What Pack kit, Unpack kit, Replace and New character do, shared by the menu, the badge,
// the nudge, first run and Settings (SPEC 7).
import { S } from '../strings.js';
import { buildKit, markBackedUp, readKit, importNew, importMerge, importReplace, startOver } from '../../data/kits.js';
import { getMeta } from '../../data/meta.js';
import { getPc } from '../../data/characters.js';
import { askPersistOnce } from '../../data/persist.js';
import { download } from '../download.js';
import { toast, reportError } from './toasts.js';
import { confirmSheet } from './confirm.js';
import { offerUnpack } from './unpack.js';

// Downloads a kit, then records the backup: the state, not the "download started" event,
// is what tests and the badge rely on (v1 lesson 7).
export async function packKit({ quiet = false } = {}) {
  try {
    const kit = await buildKit();
    download(kit.bytes, kit.filename);
    await markBackedUp(kit.exported_at);
    if (!quiet) toast(S.kit.packed(kit.filename), { kind: 'ok' });
    return kit;
  } catch (err) {
    reportError(err);
    return null;
  }
}

function explain(kit) {
  toast(S.kit.errors[kit.error] ?? S.kit.errors['bad-kit'], { kind: 'err' });
}

function reportSkips(report) {
  if (report.skippedNoteLines) toast(S.kit.skipped(report.skippedNoteLines), { kind: 'warn' });
}

// First run: load a kit into the empty app.
export async function unpackFirst(file) {
  const kit = await readKit(file).catch(() => ({ ok: false, error: 'not-zip' }));
  if (!kit.ok) return explain(kit);
  try {
    await importNew(kit);
    reportSkips(kit.report);
    toast(S.kit.loaded(nameOf(kit)), { kind: 'ok' });
    askPersistOnce();
  } catch (err) {
    reportError(err);
  }
}

export async function tryDemo() {
  try {
    const res = await fetch('demo/wren.kit');
    if (!res.ok) throw new Error(`demo: ${res.status}`);
    const kit = await readKit(await res.blob());
    if (!kit.ok) return explain(kit);
    await importNew(kit);
    askPersistOnce();
  } catch (err) {
    reportError(err);
  }
}

const nameOf = (kit) => kit.bundle.entities.find((e) => e.id === kit.bundle.pc_entity_id)?.name ?? '';

// Menu → Unpack kit, with a character already here: Merge (same character) or Replace.
export async function unpackMenu(file) {
  const kit = await readKit(file).catch(() => ({ ok: false, error: 'not-zip' }));
  if (!kit.ok) return explain(kit);
  const local = await getMeta('bundle');
  if (!local) return unpackFirst(file);
  const choice = await offerUnpack({ kit, name: nameOf(kit), same: local.bundle_id === kit.bundle.bundle_id, fileName: file.name });
  if (choice === 'merge') {
    try {
      const r = await importMerge(kit);
      reportSkips(kit.report);
      toast(S.kit.merged(r.added, r.updated), { kind: 'ok' });
    } catch (err) {
      reportError(err);
    }
  } else if (choice === 'replace') {
    await replaceWith(kit);
  }
}

// Replace: typed-name confirm, a backup kit downloads first, then one transaction.
async function replaceWith(kit) {
  const pc = await getPc();
  const ok = await confirmSheet({ title: S.kit.replaceTitle(pc.name), body: S.kit.replaceBody(pc.name, nameOf(kit)), confirmLabel: S.kit.replace, typeName: pc.name });
  if (!ok) return;
  if (!(await packKit({ quiet: true }))) return;
  try {
    await importReplace(kit);
    reportSkips(kit.report);
    toast(S.kit.loaded(nameOf(kit)), { kind: 'ok' });
  } catch (err) {
    reportError(err);
  }
}

// New character: typed-name confirm, a backup kit downloads first.
export async function newCharacter(name) {
  const pc = await getPc();
  const ok = await confirmSheet({ title: S.kit.newTitle(pc.name), body: S.kit.newBody(pc.name), confirmLabel: S.kit.startOver, typeName: pc.name });
  if (!ok) return false;
  if (!(await packKit({ quiet: true }))) return false;
  try {
    await startOver(name);
    location.hash = '#/';
    return true;
  } catch (err) {
    reportError(err);
    return false;
  }
}
