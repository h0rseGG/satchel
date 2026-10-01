// The one confirm sheet (SPEC 5.3 rule 2), for destructive actions only.
let current = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(current));

export function subscribeConfirm(fn) {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
}

// opts: { title, body, confirmLabel, typeName? } -> Promise<boolean>
// typeName: the character's name, which must be typed before confirming (Replace, New character).
export function confirmSheet(opts) {
  if (current) current.resolve(false);
  return new Promise((resolve) => {
    current = { ...opts, resolve: (ok) => { current = null; emit(); resolve(ok); } };
    emit();
  });
}
