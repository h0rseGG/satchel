// Rewrites the pre-cache file list in sw.js. Run after adding or removing app files
// (a unit test fails if the list is stale).
import { readFileSync, writeFileSync } from 'node:fs';
import { appFiles, withFiles } from './sw-files-lib.mjs';

const root = new URL('../', import.meta.url).pathname;
const path = new URL('../sw.js', import.meta.url);
const files = appFiles(root);
writeFileSync(path, withFiles(readFileSync(path, 'utf8'), files));
console.log(`sw.js: ${files.length} files to pre-cache`);
