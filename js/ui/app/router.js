// The current route as state.
import { useState, useEffect } from 'preact/hooks';
import { parseHash } from './routes.js';

export { parseHash, href, crumbs } from './routes.js';

// Re-reads the address when the listener attaches: a hashchange between the first
// render and the effect would otherwise be missed (v1 lesson 8).
export function useRoute() {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const read = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', read);
    read();
    return () => window.removeEventListener('hashchange', read);
  }, []);
  return route;
}
