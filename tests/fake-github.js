// An in-memory stand-in for the parts of the GitHub REST API that sync uses.
// Blob ids are real git blob shas, so "already uploaded?" checks behave as
// they would against GitHub. Shared by unit tests (as a fetch function) and
// browser tests (via Playwright request routing).
import { gitBlobSha, toBase64, fromBase64 } from '../js/github.js';

let counter = 0;
const fakeSha = (kind) => `${kind}${String(++counter).padStart(40 - kind.length, '0')}`;

export function fakeGitHub({ repo = 'h0rseGG/satchel-data', token = 'good-token', isPrivate = true, empty = false } = {}) {
  const blobs = new Map();   // sha -> bytes
  const trees = new Map();   // sha -> Map(path -> blob sha)
  const commits = new Map(); // sha -> { tree, parents, message }
  const state = { head: null, beforeMove: null, calls: [], private: isPrivate, offline: false };

  async function addBlob(bytes) {
    const sha = await gitBlobSha(bytes);
    blobs.set(sha, bytes);
    return sha;
  }

  async function init() {
    if (empty) return;
    const readme = await addBlob(new TextEncoder().encode('# satchel-data\n'));
    const tree = fakeSha('t');
    trees.set(tree, new Map([['README.md', readme]]));
    const commit = fakeSha('c');
    commits.set(commit, { tree, parents: [], message: 'Initial commit' });
    state.head = commit;
  }
  const ready = init();

  // Handle one request. Returns { status, json }.
  async function handle(method, url, bodyText, headers) {
    await ready;
    if (state.offline) throw new TypeError('NetworkError when attempting to fetch resource.');
    const u = new URL(url);
    const prefix = `/repos/${repo}`;
    state.calls.push(`${method} ${u.pathname.replace(prefix, '')}`);
    if (!u.pathname.startsWith(prefix)) return { status: 404, json: { message: 'Not Found' } };
    if (headers.authorization !== `Bearer ${token}`) return { status: 401, json: { message: 'Bad credentials' } };
    const path = u.pathname.slice(prefix.length);
    const body = bodyText ? JSON.parse(bodyText) : null;
    let m;

    if (method === 'GET' && path === '') {
      return { status: 200, json: { full_name: repo, private: state.private, default_branch: 'main', permissions: { push: true } } };
    }
    if (method === 'GET' && (m = path.match(/^\/git\/ref\/heads\/(.+)$/))) {
      if (!state.head) return { status: 409, json: { message: 'Git Repository is empty.' } };
      return { status: 200, json: { object: { sha: state.head } } };
    }
    if (method === 'GET' && (m = path.match(/^\/git\/commits\/(\w+)$/))) {
      const c = commits.get(m[1]);
      return c ? { status: 200, json: { sha: m[1], tree: { sha: c.tree }, message: c.message } } : { status: 404, json: {} };
    }
    if (method === 'GET' && (m = path.match(/^\/git\/trees\/(\w+)$/))) {
      const t = trees.get(m[1]);
      if (!t) return { status: 404, json: {} };
      return { status: 200, json: { sha: m[1], truncated: false, tree: [...t].map(([p, sha]) => ({ path: p, type: 'blob', mode: '100644', sha })) } };
    }
    if (method === 'GET' && (m = path.match(/^\/git\/blobs\/(\w+)$/))) {
      const b = blobs.get(m[1]);
      // GitHub wraps base64 at 60 columns; mimic that.
      return b ? { status: 200, json: { content: toBase64(b).replace(/(.{60})/g, '$1\n'), encoding: 'base64' } } : { status: 404, json: {} };
    }
    if (method === 'POST' && path === '/git/blobs') {
      return { status: 201, json: { sha: await addBlob(fromBase64(body.content)) } };
    }
    if (method === 'POST' && path === '/git/trees') {
      const base = trees.get(body.base_tree);
      if (!base) return { status: 422, json: { message: 'base_tree not found' } };
      const next = new Map(base);
      for (const e of body.tree) {
        if (e.sha === null) next.delete(e.path);
        else if (blobs.has(e.sha)) next.set(e.path, e.sha);
        else return { status: 422, json: { message: `blob ${e.sha} not found` } };
      }
      const sha = fakeSha('t');
      trees.set(sha, next);
      return { status: 201, json: { sha } };
    }
    if (method === 'POST' && path === '/git/commits') {
      const sha = fakeSha('c');
      commits.set(sha, { tree: body.tree, parents: body.parents, message: body.message });
      return { status: 201, json: { sha } };
    }
    if (method === 'PATCH' && (m = path.match(/^\/git\/refs\/heads\/(.+)$/))) {
      if (state.beforeMove) { const f = state.beforeMove; state.beforeMove = null; await f(); }
      const c = commits.get(body.sha);
      if (!c) return { status: 422, json: { message: 'Object does not exist' } };
      if (!body.force && !c.parents.includes(state.head)) return { status: 422, json: { message: 'Update is not a fast forward' } };
      state.head = body.sha;
      return { status: 200, json: { object: { sha: body.sha } } };
    }
    return { status: 404, json: { message: `fake: no route for ${method} ${path}` } };
  }

  // fetch()-compatible function for unit tests.
  async function fetchFn(url, opts = {}) {
    const headers = Object.fromEntries(Object.entries(opts.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const { status, json } = await handle(opts.method ?? 'GET', url, opts.body ?? null, headers);
    return { ok: status >= 200 && status < 300, status, json: async () => json };
  }

  // Files currently in the repo at head, as { path: text }, for assertions.
  async function snapshot() {
    await ready;
    const t = trees.get(commits.get(state.head).tree);
    return Object.fromEntries([...t].map(([p, sha]) => [p, new TextDecoder().decode(blobs.get(sha))]));
  }

  // Simulate another device pushing a commit (for conflict tests).
  async function pushFromElsewhere(path, text) {
    await ready;
    const blob = await addBlob(new TextEncoder().encode(text));
    const tree = fakeSha('t');
    trees.set(tree, new Map([...trees.get(commits.get(state.head).tree), [path, blob]]));
    const commit = fakeSha('c');
    commits.set(commit, { tree, parents: [state.head], message: 'elsewhere' });
    state.head = commit;
  }

  return { handle, fetchFn, snapshot, pushFromElsewhere, state, commits };
}
