// Builds demo/wren.kit from tools/demo-data.mjs using the app's own core code.
// Run: node tools/make-demo-kit.mjs  (a unit test fails if the committed kit is stale).
import { writeFileSync } from 'node:fs';
import { buildDemo, EXPORTED_AT } from './demo-data.mjs';
import { packKit } from '../js/core/kit.js';

const { bundle, blobs } = buildDemo();
const { bytes } = packKit(bundle, blobs, { now: new Date(EXPORTED_AT) });
writeFileSync(new URL('../demo/wren.kit', import.meta.url), bytes);
console.log(`demo/wren.kit: ${bytes.length} bytes, ${bundle.notes.length} notes, ${bundle.entities.length} entities`);
