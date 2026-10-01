// The "Unpack kit" choice: Merge (same character) or Replace. Resolves 'merge' | 'replace' | null.
let current = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(current));

export function subscribeUnpack(fn) {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
}

export function offerUnpack(info) {
  if (current) current.resolve(null);
  return new Promise((resolve) => {
    current = { ...info, resolve: (v) => { current = null; emit(); resolve(v); } };
    emit();
  });
}
