// Rewrites the import-map hash in index.html's Content-Security-Policy.
import { readFileSync, writeFileSync } from 'node:fs';
import { withFreshHash, importMapHash } from './csp-lib.mjs';

const path = new URL('../index.html', import.meta.url);
const src = readFileSync(path, 'utf8');
writeFileSync(path, withFreshHash(src));
console.log(`CSP import-map hash: ${importMapHash(src)}`);
