// Minimal GitHub REST client for sync (SPEC section 5a). Only the Git Data
// API calls sync needs. `fetchFn` is injectable so tests can use a fake.
//
// Calls go straight from the browser to api.github.com (CORS allowed, see
// SPEC verification results). The service worker ignores cross-origin
// requests, so it never sees the token.

export class GitHubError extends Error {
  constructor(status, message, detail = '') {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

// The remote moved while we were syncing: pull, merge and try again.
export class ConflictError extends GitHubError {}

function friendly(status, detail) {
  if (status === 401) return 'GitHub rejected the token (wrong or expired). Update it in Sync settings.';
  if (status === 403) return `GitHub refused the request: ${detail || 'the token may lack Contents read/write permission'}.`;
  if (status === 404) return 'Sync repo not found, or the token can’t see it. Check the repo name and token.';
  if (status === 409) return 'The sync repo is empty. On GitHub, add a README to it, then sync again.';
  return `GitHub error ${status}${detail ? `: ${detail}` : ''}.`;
}

export function github({ token, repo, fetchFn = (...a) => fetch(...a) }) {
  const base = `https://api.github.com/repos/${repo}`;

  async function call(method, path, body) {
    let res;
    try {
      res = await fetchFn(base + path, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
    } catch {
      throw new GitHubError(0, 'Can’t reach GitHub. Check your connection and try again.');
    }
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).message ?? ''; } catch { /* no body */ }
      throw new GitHubError(res.status, friendly(res.status, detail), detail);
    }
    return res.status === 204 ? null : res.json();
  }

  return {
    repoInfo: () => call('GET', ''),
    headSha: async (branch) => (await call('GET', `/git/ref/heads/${encodeURIComponent(branch)}`)).object.sha,
    commit: (sha) => call('GET', `/git/commits/${sha}`),
    tree: (sha) => call('GET', `/git/trees/${sha}?recursive=1`),
    blobBytes: async (sha) => fromBase64((await call('GET', `/git/blobs/${sha}`)).content),
    createBlob: async (bytes) => (await call('POST', '/git/blobs', { content: toBase64(bytes), encoding: 'base64' })).sha,
    createTree: async (baseTree, tree) => (await call('POST', '/git/trees', { base_tree: baseTree, tree })).sha,
    createCommit: async (message, tree, parents) => (await call('POST', '/git/commits', { message, tree, parents })).sha,
    // Not forced: GitHub refuses unless it's a fast-forward from what we pulled.
    moveBranch: async (branch, sha) => {
      try {
        await call('PATCH', `/git/refs/heads/${encodeURIComponent(branch)}`, { sha, force: false });
      } catch (err) {
        if (err.status === 422 || err.status === 409) throw new ConflictError(err.status, 'The online copy changed during sync.', err.detail);
        throw err;
      }
    },
  };
}

// ---------- bytes <-> base64, git blob ids ----------

export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64) {
  const s = atob(String(b64).replace(/\s/g, ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// Git's id for file contents: SHA-1 of "blob <size>\0" + bytes. Lets sync
// skip uploading files GitHub already has.
export async function gitBlobSha(bytes) {
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const buf = new Uint8Array(header.length + bytes.length);
  buf.set(header);
  buf.set(bytes, header.length);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', buf));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}
