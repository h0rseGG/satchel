import { html } from './html.js';
import { useRoute } from './router.js';
import { Dashboard } from './pages/Dashboard.js';
import { EntityList } from './pages/EntityList.js';
import { Entity } from './pages/Entity.js';

// The out-of-session screen (back layer, SPEC section 7): one page per
// address. Unknown addresses fall back to the dashboard.
export function OutScreen({ pcId, pc, onMessage }) {
  const { parts } = useRoute();
  const [page] = parts;
  const props = { pcId, pc, onMessage, parts };

  switch (page) {
    case 'list': return html`<${EntityList} ...${props} />`;
    case 'entity': return html`<${Entity} key=${parts[1]} ...${props} />`;
    default: return html`<${Dashboard} ...${props} />`;
  }
}
