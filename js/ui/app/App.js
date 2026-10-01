import { useEffect } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';
import { useLive } from '../useLive.js';
import { useRoute, crumbs as makeCrumbs } from './router.js';
import { Toasts } from './Toasts.js';
import { ConfirmHost } from './ConfirmHost.js';
import { TopBar } from './TopBar.js';
import { frameState, getEntity, getFile } from '../../data/frame.js';
import { setSession } from '../../data/session.js';
import { reportError } from './toasts.js';
import { isDev } from '../dev.js';
import { FirstRun } from '../screens/FirstRun.js';
import { Home } from '../screens/Home.js';
import { NotBuilt } from '../screens/NotBuilt.js';
import { Gallery } from '../screens/Gallery.js';

// The app follows the visual viewport, so a phone keyboard shrinks the app
// instead of covering the bottom of it (SPEC 5.1).
function useViewportHeight() {
  useEffect(() => {
    const vv = window.visualViewport;
    const set = () => document.documentElement.style.setProperty('--app-h', `${vv ? vv.height : window.innerHeight}px`);
    set();
    vv?.addEventListener('resize', set);
    window.addEventListener('resize', set);
    return () => {
      vv?.removeEventListener('resize', set);
      window.removeEventListener('resize', set);
    };
  }, []);
}

export function App() {
  useViewportHeight();
  const route = useRoute();
  const frame = useLive(frameState, [], null);
  const entity = useLive(() => getEntity(route.name === 'entity' ? route.params.id : null), [route.name, route.params.id], null);
  const file = useLive(() => getFile(route.name === 'file' ? route.params.id : null), [route.name, route.params.id], null);

  if (!frame) return html`<div class="app"></div>`;
  const hasCharacter = !!frame.bundle && !!frame.pc;
  const typeLabel = (id) => frame.types.find((t) => t.id === id)?.plural ?? null;
  const crumbs = hasCharacter ? makeCrumbs(route, { S, typeLabel, entity: (id) => (entity?.id === id ? entity : null), file: (id) => (file?.id === id ? file : null) }) : [];
  const toggleSession = () => setSession(frame.session?.mode !== 'in').catch(reportError);

  return html`
    <div class="app">
      <${TopBar} name=${frame.pc?.name} crumbs=${crumbs} session=${frame.session} backup=${frame.backup} hasCharacter=${hasCharacter} onToggleSession=${toggleSession} />
      <div class="app-body">
        <main class="page-scroll" id="main">
          <div class="page">${screen(route, frame, hasCharacter, crumbs)}</div>
        </main>
        <${Toasts} />
      </div>
      <${ConfirmHost} />
    </div>`;
}

function screen(route, frame, hasCharacter, crumbs) {
  if (route.name === 'gallery' && isDev) return html`<${Gallery} />`;
  if (!hasCharacter) return html`<${FirstRun} />`;
  if (route.name === 'home') return html`<${Home} pc=${frame.pc} />`;
  if (route.name === 'notfound' || route.name === 'gallery') return html`<${NotBuilt} title=${S.nav.notFound} />`;
  return html`<${NotBuilt} title=${crumbs.at(-1)?.label ?? S.nav.notFound} />`;
}
