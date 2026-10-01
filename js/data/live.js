// Live queries for the UI, so screens never import Dexie (SPEC 9).
import { liveQuery } from 'dexie';

// Calls onValue with the querier's result now and after every change it depends on.
// Returns an unsubscribe function.
export function observe(querier, onValue, onError) {
  const sub = liveQuery(querier).subscribe({ next: onValue, error: onError });
  return () => sub.unsubscribe();
}
