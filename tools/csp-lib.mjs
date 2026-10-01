import { createHash } from 'node:crypto';

// CSP hashes cover the exact text between <script ...> and </script>, whitespace included.
const IMPORTMAP = /<script type="importmap">([\s\S]*?)<\/script>/;
const SCRIPT_HASH = /'sha256-[^']*'/;

export function importMapHash(indexHtml) {
  const m = indexHtml.match(IMPORTMAP);
  if (!m) throw new Error('No import map in index.html');
  return `'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`;
}

export function cspScriptHash(indexHtml) {
  const csp = indexHtml.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/);
  if (!csp) throw new Error('No CSP meta in index.html');
  return csp[1].match(SCRIPT_HASH)?.[0] ?? null;
}

export function withFreshHash(indexHtml) {
  return indexHtml.replace(SCRIPT_HASH, importMapHash(indexHtml));
}
