// Re-runs a database query whenever the data it read changes (including
// changes made in another tab) and re-renders the component with the result.
import { liveQuery } from 'dexie';
import { useEffect, useState } from 'preact/hooks';

export function useLive(query, deps = [], initial = undefined) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({
      next: (v) => setValue(() => v),
      error: (err) => console.error('liveQuery failed', err),
    });
    return () => sub.unsubscribe();
  }, deps);
  return value;
}
