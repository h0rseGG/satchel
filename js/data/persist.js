// Persistent storage: asks Firefox not to clear this site's data under storage pressure.
// Firefox shows its own prompt with "remember decision" (SPEC 2, verified in v1).
import { getMeta, setMeta } from './meta.js';

export async function askPersist() {
  if (!navigator.storage?.persist) return false;
  let granted = false;
  try {
    granted = await navigator.storage.persist();
  } catch {
    granted = false;
  }
  await setMeta('persist', { asked: true, granted });
  return granted;
}

export async function persistState() {
  const meta = await getMeta('persist');
  const granted = navigator.storage?.persisted ? await navigator.storage.persisted().catch(() => false) : false;
  return { ...meta, granted, supported: !!navigator.storage?.persist };
}

// First run: ask once, quietly, after the character exists.
export async function askPersistOnce() {
  const meta = await getMeta('persist');
  if (!meta.asked) await askPersist();
}
