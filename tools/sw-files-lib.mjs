import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Every file the app needs offline, as paths relative to the site root.
export function appFiles(root) {
  const walk = (dir) => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [relative(root, p)];
  });
  const keep = (p) => /\.(js|mjs|css|woff2|png|svg|webmanifest|kit)$/.test(p) || p === 'index.html';
  return ['./', 'index.html', 'manifest.webmanifest', ...['css', 'js', 'vendor', 'icons', 'demo'].flatMap((d) => walk(join(root, d)))]
    .filter((p) => p === './' || keep(p))
    .filter((p, i, a) => a.indexOf(p) === i)
    .sort();
}

const BLOCK = /\/\/ BEGIN FILES[\s\S]*?\/\/ END FILES/;
export const swBlock = (files) => `// BEGIN FILES (written by tools/sw-files.mjs)\nconst FILES = ${JSON.stringify(files, null, 2)};\n// END FILES`;
export const readBlock = (sw) => sw.match(BLOCK)?.[0] ?? null;
export const withFiles = (sw, files) => sw.replace(BLOCK, swBlock(files));
