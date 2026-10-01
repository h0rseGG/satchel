// Hash addresses for out-of-session pages (#/, #/character, #/entity/<id>…).
// Using the hash keeps it a static site (GitHub Pages serves one index.html)
// and makes the browser and Android back buttons move between pages.
import { useEffect, useState } from 'preact/hooks';

export function parseHash(hash) {
  const path = decodeURI(String(hash ?? '').replace(/^#/, '')) || '/';
  return { path, parts: path.split('/').filter(Boolean) };
}

export function useRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    window.addEventListener('hashchange', onChange);
    // The address may have changed between the first render and this
    // listener being attached (seen as a flaky test); catch up now.
    onChange();
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return parseHash(hash);
}

export const href = (path) => `#${path}`;

export function go(path) {
  location.hash = path;
}
