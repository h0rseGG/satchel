import { html } from './html.js';
import { useRoute } from './router.js';
import { Dashboard } from './pages/Dashboard.js';

// The out-of-session screen (back layer, SPEC section 7): one page per
// address. Unknown addresses fall back to the dashboard.
export function OutScreen({ pcId, pc, onMessage }) {
  const { parts } = useRoute();
  const [page] = parts;
  const props = { pcId, pc, onMessage, parts };

  switch (page) {
    default:
      return html`<${Dashboard} ...${props} />`;
  }
}
