// Sync now, settings and checks (SPEC D14, section 5a). Glue between the
// database and the sync engine (syncCore.js), which is tested on its own.

import { db, getMeta, setMeta, unpackMerge, currentKitData, markBackedUp } from './db.js';
import { github, ConflictError } from './github.js';
import { pull, push, folderFor, folderShasAfterPush, remoteChanged, MAX_TRIES, SYNC_INFO } from './syncCore.js';
import { kitFiles, readKitFiles } from './kit.js';
import { FILE_PATH } from './fileRules.js';
import { APP_VERSION, now } from './model.js';

const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

export async function syncSettings() {
  return {
    repo: await getMeta('sync_repo', ''),
    token: await getMeta('sync_token', ''),
    device: await getMeta('sync_device', ''),
    branch: await getMeta('sync_branch', ''),
  };
}

// What the menu shows: configured?, unsynced change count, last sync time.
export async function syncStatus() {
  const s = await syncSettings();
  return {
    configured: Boolean(s.repo && s.token && s.device),
    changes: await getMeta('changes_since_sync', 0),
    lastSyncedAt: await getMeta('last_synced_at'),
  };
}

// Check the repo exists, the token works, and the repo is PRIVATE (a public
// repo would publish your notes). Returns the default branch.
export async function testConnection({ repo, token }, fetchFn) {
  if (!REPO.test(repo)) throw new Error('Repo should look like owner/name, e.g. h0rseGG/satchel-data.');
  if (!token) throw new Error('Paste a GitHub token.');
  const info = await github({ token, repo, fetchFn }).repoInfo();
  if (!info.private) throw new Error('That repo is public: anyone could read your notes. Make it private on GitHub, or use a private repo.');
  if (info.permissions && !info.permissions.push) throw new Error('The token can read the repo but not write to it. Give it Contents: Read and write.');
  return info.default_branch;
}

export async function saveSyncSettings({ repo, token, device }, fetchFn) {
  const name = String(device ?? '').trim();
  if (!name) throw new Error('Give this device a name, e.g. Pixel or PC.');
  const branch = await testConnection({ repo: repo.trim(), token: token.trim() }, fetchFn);
  await setMeta('sync_repo', repo.trim());
  await setMeta('sync_token', token.trim());
  await setMeta('sync_device', name);
  await setMeta('sync_branch', branch);
}

export async function forgetSyncSettings() {
  for (const k of ['sync_repo', 'sync_token', 'sync_device', 'sync_branch', 'sync_last_shas', 'last_synced_at']) {
    await db.meta.delete(k);
  }
}

async function connect(fetchFn) {
  const s = await syncSettings();
  if (!s.repo || !s.token || !s.device) throw new Error('Set up sync first: Menu → Sync settings.');
  const gh = github({ token: s.token, repo: s.repo, fetchFn });
  // Re-checked every time, in case the repo was made public since setup.
  const info = await gh.repoInfo();
  if (!info.private) throw new Error('The sync repo is now public. Sync stopped so your notes stay private.');
  const folder = folderFor(await getMeta('bundle_id'));
  return { gh, s, branch: s.branch || info.default_branch, folder };
}

// Same data -> same files: stamp the kit with the newest record time rather
// than "now", so a sync with nothing new changes nothing online.
function stableStamp(data) {
  let t = '1970-01-01T00:00:00.000Z';
  for (const table of ['entities', 'notes', 'sessions', 'relationships', 'files']) {
    for (const r of data[table] ?? []) if (r.updated_at > t) t = r.updated_at;
  }
  return t;
}

// Don't download file bytes this device already has (file ids never change
// contents), nor sync.json.
const skipKnownFiles = (have) => (path) => {
  if (path === SYNC_INFO) return true;
  const m = path.match(FILE_PATH);
  return Boolean(m && have.has(m[1]));
};

async function recordSynced(pulled, files) {
  await setMeta('sync_last_shas', await folderShasAfterPush(pulled, files));
  await setMeta('last_synced_at', now());
  await setMeta('changes_since_sync', 0);
  await markBackedUp(); // the online copy counts as a backup (SPEC 5a)
}

// Sync now: pull -> merge -> push; retry if another device pushed meanwhile.
// Returns { report (merge counts, or null if the online copy was empty), uploaded }.
export async function syncNow({ fetchFn } = {}) {
  const { gh, s, branch, folder } = await connect(fetchFn);
  const bundleId = await getMeta('bundle_id');
  for (let attempt = 1; ; attempt++) {
    const have = new Set(await db.blobs.toCollection().primaryKeys());
    const pulled = await pull(gh, branch, folder, skipKnownFiles(have));
    let report = null;
    if (pulled.files['character.json']) {
      const { data } = readKitFiles(pulled.files);
      if (data.bundle_id !== bundleId) throw new Error('The online folder belongs to a different character.');
      report = await unpackMerge(data);
    }
    const data = await currentKitData();
    const files = kitFiles(data, stableStamp(data));
    try {
      const r = await push(gh, branch, folder, pulled, files, {
        message: `Sync from ${s.device}`,
        info: { device: s.device, synced_at: now(), app_version: APP_VERSION },
      });
      await recordSynced(pulled, files);
      return { report, uploaded: r.changed.length };
    } catch (err) {
      if (err instanceof ConflictError && attempt < MAX_TRIES) continue;
      if (err instanceof ConflictError) throw new Error('Another device kept syncing at the same time. Try again in a moment.');
      throw err;
    }
  }
}

// On app open: has the online copy changed since this device last synced?
// Returns { changed, device, syncedAt } or null if sync isn't set up or
// GitHub can't be reached (never throws: this is a hint, not an action).
export async function checkRemote({ fetchFn } = {}) {
  try {
    const { gh, branch, folder } = await connect(fetchFn);
    const pulled = await pull(gh, branch, folder, (p) => p !== SYNC_INFO);
    if (!remoteChanged(await getMeta('sync_last_shas'), pulled.shas)) return { changed: false };
    let who = {};
    if (pulled.files[SYNC_INFO]) {
      try { who = JSON.parse(new TextDecoder().decode(pulled.files[SYNC_INFO])); } catch { /* ignore */ }
    }
    return { changed: true, device: who.device ?? null, syncedAt: who.synced_at ?? null };
  } catch {
    return null;
  }
}

// Emergency: make the online copy exactly match this device (no merge).
export async function replaceOnlineCopy({ fetchFn } = {}) {
  const { gh, s, branch, folder } = await connect(fetchFn);
  const pulled = await pull(gh, branch, folder, () => true);
  const data = await currentKitData();
  const files = kitFiles(data, stableStamp(data));
  await push(gh, branch, folder, pulled, files, {
    message: `Replace online copy from ${s.device}`,
    info: { device: s.device, synced_at: now(), app_version: APP_VERSION },
    exact: true,
  });
  await recordSynced(pulled, files);
}

// Emergency: download the whole online copy, for "Replace this device".
// Returns kit data (validated like an unpacked kit).
export async function fetchOnlineCopy({ fetchFn } = {}) {
  const { gh, branch, folder } = await connect(fetchFn);
  const pulled = await pull(gh, branch, folder, (p) => p === SYNC_INFO);
  if (!pulled.files['character.json']) throw new Error('There is no online copy of this character yet.');
  const { data, report } = readKitFiles(pulled.files);
  // Call after replacing: this device now matches the online copy exactly.
  const after = async () => {
    const shas = Object.fromEntries(pulled.shas);
    delete shas[SYNC_INFO];
    await setMeta('sync_last_shas', shas);
    await setMeta('last_synced_at', now());
    await setMeta('changes_since_sync', 0);
  };
  return { data, report, after };
}
