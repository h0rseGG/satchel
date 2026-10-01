import { useEffect, useState } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';
import { useLive } from '../useLive.js';
import { useCapture } from '../useCapture.js';
import { useRoute, crumbs as makeCrumbs } from './router.js';
import { Toasts } from './Toasts.js';
import { ConfirmHost } from './ConfirmHost.js';
import { TopBar } from './TopBar.js';
import { frameState, getEntity, getFile } from '../../data/frame.js';
import { setSession, getSession } from '../../data/session.js';
import { lastInSessionNoteAt } from '../../data/notes.js';
import { shouldAutoEnd } from '../../core/session.js';
import { toast, reportError } from './toasts.js';
import { isDev } from '../dev.js';
import { FirstRun } from '../screens/FirstRun.js';
import { Home } from '../screens/Home.js';
import { Session } from '../screens/Session.js';
import { NotBuilt } from '../screens/NotBuilt.js';
import { Gallery } from '../screens/Gallery.js';
import { World } from '../screens/World.js';
import { TypeList } from '../screens/TypeList.js';
import { Entity } from '../screens/Entity.js';
import { Inbox } from '../screens/Inbox.js';
import { Notes } from '../screens/Notes.js';
import { CaptureBox } from '../components/CaptureBox.js';

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

// Ends a session left on for 12 h with nothing written: checked on open and every minute.
function useAutoEnd(active) {
  useEffect(() => {
    if (!active) return undefined;
    const check = async () => {
      const s = await getSession();
      if (shouldAutoEnd(s, await lastInSessionNoteAt(), new Date().toISOString())) {
        await setSession(false);
        toast(S.autoEnd, { kind: 'warn' });
      }
    };
    check().catch(reportError);
    const t = setInterval(() => check().catch(reportError), 60_000);
    return () => clearInterval(t);
  }, [active]);
}

export function App() {
  useViewportHeight();
  const route = useRoute();
  const frame = useLive(frameState, [], null);
  const entity = useLive(() => getEntity(route.name === 'entity' ? route.params.id : null), [route.name, route.params.id], null);
  const file = useLive(() => getFile(route.name === 'file' ? route.params.id : null), [route.name, route.params.id], null);
  const [overview, setOverview] = useState(false);
  const hasCharacter = !!frame?.bundle && !!frame?.pc;
  const inSession = hasCharacter && frame.session?.mode === 'in';
  useAutoEnd(inSession);
  useEffect(() => { if (!inSession) setOverview(false); }, [inSession]);

  if (!frame) return html`<div class="app"></div>`;
  const typeLabel = (id) => frame.types.find((t) => t.id === id)?.plural ?? null;
  const crumbs = hasCharacter && !inSession ? makeCrumbs(route, { S, typeLabel, entity: (id) => (entity?.id === id ? entity : null), file: (id) => (file?.id === id ? file : null) }) : [];
  const toggleSession = () => setSession(!inSession).catch(reportError);
  // In session, your name opens the character overview instead of going Home.
  const onHome = inSession ? (e) => { e.preventDefault(); setOverview(!overview); } : null;

  let body;
  if (route.name === 'gallery' && isDev && !inSession) body = html`<${Page}><${Gallery} /><//>`;
  else if (!hasCharacter) body = html`<${Page}><${FirstRun} /><//>`;
  else if (inSession) body = html`<main class="session-main" id="main"><${Session} pc=${frame.pc} session=${frame.session} overview=${overview} onCloseOverview=${() => setOverview(false)} /></main>`;
  else if (route.name === 'home') body = html`<${HomeFrame} pc=${frame.pc} />`;
  else if (route.name === 'inbox') body = html`<${Page}><${Inbox} pc=${frame.pc} /><//>`;
  else if (route.name === 'notes') body = html`<${Page}><${Notes} query=${route.query} pc=${frame.pc} /><//>`;
  else if (route.name === 'world') body = html`<${Page}><${World} /><//>`;
  else if (route.name === 'type') body = html`<${Page}><${TypeList} key=${route.params.typeId} typeId=${route.params.typeId} pcId=${frame.pc.id} /><//>`;
  else if (route.name === 'stubs') body = html`<${Page}><${TypeList} key="stubs" typeId=${null} pcId=${frame.pc.id} /><//>`;
  else if (route.name === 'entity') body = html`<${Page}><${Entity} key=${route.params.id} id=${route.params.id} pcId=${frame.pc.id} /><//>`;
  else body = html`<${Page}><${NotBuilt} title=${crumbs.at(-1)?.label ?? S.nav.notFound} /><//>`;

  return html`
    <div class="app">
      <${TopBar} name=${frame.pc?.name} crumbs=${crumbs} session=${frame.session} backup=${frame.backup} hasCharacter=${hasCharacter} onToggleSession=${toggleSession} onHome=${onHome} overviewOpen=${overview} />
      <div class="app-body">
        ${body}
        <${Toasts} />
      </div>
      <${ConfirmHost} />
    </div>`;
}

function Page({ children }) {
  return html`<main class="page-scroll" id="main"><div class="page">${children}</div></main>`;
}

// Home with the quick note box pinned at the bottom.
function HomeFrame({ pc }) {
  const cap = useCapture();
  return html`
    <div class="with-box">
      <${Page}><${Home} pc=${pc} cap=${cap} /><//>
      <div class="quick-note">
        <${CaptureBox} cap=${cap} pcId=${pc.id} placeholder=${S.capture.placeholderOut} onSaved=${() => toast(S.capture.saved, { kind: 'ok', ms: 3000 })} />
      </div>
    </div>`;
}
