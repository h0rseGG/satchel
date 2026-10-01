// Toast messages: float under the top bar without moving the page (v1 lesson 6).
import { S } from '../strings.js';

const AUTO_HIDE_MS = 8000;
let items = [];
let nextId = 1;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(items));

export function subscribeToasts(fn) {
  listeners.add(fn);
  fn(items);
  return () => listeners.delete(fn);
}

// kind: 'info' | 'ok' | 'warn' | 'err'
export function toast(text, { kind = 'info', ms = AUTO_HIDE_MS } = {}) {
  const id = nextId++;
  items = [...items, { id, text, kind }];
  emit();
  if (ms) setTimeout(() => dismissToast(id), ms);
  return id;
}

export function dismissToast(id) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export function reportError(err) {
  console.error(err);
  toast(S.errors.unexpected, { kind: 'err' });
}
