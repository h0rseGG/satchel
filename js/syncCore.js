// Sync engine (SPEC section 5a): pull the online copy, push a merged copy.
// No database code here: the caller merges, so this is unit tested against
// a fake GitHub (tests/fake-github.js).
//
// Repo layout: one folder per character, so a New character never
// overwrites another one.
//   characters/<bundle_id>/character.json
//   characters/<bundle_id>/notes.jsonl
//   characters/<bundle_id>/files/<id>.<webp|jpg|txt|md>
//   characters/<bundle_id>/sync.json      who synced last, and when

import { gitBlobSha } from './github.js';

export const MAX_TRIES = 3;
export const SYNC_INFO = 'sync.json';

export function folderFor(bundleId) {
  return `characters/${bundleId}/`;
}

// Read this character's folder at the branch head.
// skip(path): true for files we don't need to download (file bytes we already have).
// Returns { head, treeSha, shas: Map(path -> blob sha), files: { path: bytes } }.
export async function pull(gh, branch, folder, skip = () => false) {
  const head = await gh.headSha(branch);
  const commit = await gh.commit(head);
  const tree = await gh.tree(commit.tree.sha);
  if (tree.truncated) throw new Error('The sync repo is too large to read in one go.');
  const shas = new Map();
  for (const t of tree.tree) {
    if (t.type === 'blob' && t.path.startsWith(folder)) shas.set(t.path.slice(folder.length), t.sha);
  }
  const files = {};
  for (const [path, sha] of shas) {
    if (!skip(path)) files[path] = await gh.blobBytes(sha);
  }
  return { head, treeSha: commit.tree.sha, shas, files };
}

// Commit `files` ({ path: bytes }) into the folder on top of what was pulled.
// Only files whose contents differ are uploaded. With `exact`, files in the
// folder that aren't in `files` are deleted (used by "replace online copy").
// sync.json is only written when something else changed, so a sync with
// nothing new makes no commit.
// Returns { commit, changed: [paths] }. Throws ConflictError if the branch
// moved since the pull.
export async function push(gh, branch, folder, pulled, files, { message, info, exact = false }) {
  const changed = [];
  for (const [path, bytes] of Object.entries(files)) {
    if (pulled.shas.get(path) !== (await gitBlobSha(bytes))) changed.push(path);
  }
  const removed = exact
    ? [...pulled.shas.keys()].filter((p) => p !== SYNC_INFO && !(p in files))
    : [];
  if (!changed.length && !removed.length) return { commit: pulled.head, changed: [] };

  const all = { ...files, [SYNC_INFO]: new TextEncoder().encode(`${JSON.stringify(info, null, 2)}\n`) };
  const entries = [];
  for (const path of [...changed, SYNC_INFO]) {
    entries.push({ path: folder + path, mode: '100644', type: 'blob', sha: await gh.createBlob(all[path]) });
  }
  for (const path of removed) entries.push({ path: folder + path, mode: '100644', type: 'blob', sha: null });

  const tree = await gh.createTree(pulled.treeSha, entries);
  const commit = await gh.createCommit(message, tree, [pulled.head]);
  await gh.moveBranch(branch, commit);
  return { commit, changed: [...changed, ...removed] };
}

// Blob shas for the folder after a successful push: what's online now.
// Used on app open to tell whether the online copy changed since.
export async function folderShasAfterPush(pulled, files) {
  const out = Object.fromEntries(pulled.shas);
  for (const [path, bytes] of Object.entries(files)) out[path] = await gitBlobSha(bytes);
  delete out[SYNC_INFO];
  return out;
}

// True when the online copy differs from what we last synced (sync.json ignored).
export function remoteChanged(lastShas, pulledShas) {
  if (!lastShas) return pulledShas.size > 0;
  const now = Object.fromEntries([...pulledShas].filter(([p]) => p !== SYNC_INFO));
  const keys = new Set([...Object.keys(now), ...Object.keys(lastShas)]);
  return [...keys].some((k) => now[k] !== lastShas[k]);
}
