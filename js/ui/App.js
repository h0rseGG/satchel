import { useEffect, useState } from 'preact/hooks';
import { html } from './html.js';
import { useLive } from './useLive.js';
import { db, getMeta, backupMeta, lastInNoteAt, sessionMeta, setMode } from '../db.js';
import { backupStatus } from '../backup.js';
import { shouldAutoEnd } from '../session.js';
import { checkRemote } from '../sync.js';
import { EndNudge } from './EndNudge.js';
import { formatShort } from './format.js';
import { FirstRun } from './FirstRun.js';
import { CaptureScreen } from './CaptureScreen.js';
import { OutScreen } from './OutScreen.js';
import { Menu } from './Menu.js';
import { BackupBadge } from './BackupBadge.js';
import { href } from './router.js';
import { BUILD } from '../version.js';

export function App() {
  const bundleId = useLive(() => getMeta('bundle_id'), [], undefined);
  if (bundleId === undefined) return null; // still loading
  if (!bundleId) return html`<${FirstRun} />`;
  return html`<${Main} />`;
}

// Everything shared by both screens: top bar, messages, session mode,
// auto-end, and the "online copy changed" check. The mode picks the screen
// (SPEC section 7): in session -> capture, out of session -> dashboard/pages.
function Main() {
  const pcId = useLive(() => getMeta('pc_entity_id'), [], null);
  const pc = useLive(async () => (pcId ? db.entities.get(pcId) : null), [pcId], null);
  const session = useLive(sessionMeta, [], undefined);

  // Short status message under the top bar (e.g. "Kit packed"), auto-hides.
  const [message, setMessage] = useState(null);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 8000);
    return () => clearTimeout(t);
  }, [message]);

  // In / Out of session. Ending a session with unsaved changes nudges a backup.
  const [nudge, setNudge] = useState(null);
  async function toggleSession() {
    if (session.mode === 'in') {
      await setMode('out');
      const status = backupStatus(await backupMeta());
      if (status.kind !== 'ok') setNudge(status);
    } else {
      await setMode('in');
    }
  }

  // On open: tell me if another device has synced since this one did.
  useEffect(() => {
    checkRemote().then((r) => {
      if (!r?.changed) return;
      const who = r.device ? ` (synced from ${r.device}${r.syncedAt ? `, ${formatShort(r.syncedAt)}` : ''})` : '';
      setMessage({ kind: 'warn', text: `Online copy changed${who}. Menu → Sync now.` });
    });
  }, []);

  // Auto-end after 12 h idle (checked on open and every minute).
  useEffect(() => {
    if (session?.mode !== 'in') return;
    const check = async () => {
      if (shouldAutoEnd(session, await lastInNoteAt())) {
        await setMode('out');
        setMessage({ kind: 'neutral', text: 'Session ended automatically after 12 hours without notes.' });
      }
    };
    check();
    const t = setInterval(check, 60 * 1000);
    return () => clearInterval(t);
  }, [session?.mode, session?.mode_since]);

  if (!session) return null; // still loading
  const inSession = session.mode === 'in';
  const name = pc ? pc.name : 'Satchel';

  return html`
    <header class="topbar">
      ${inSession
        ? html`<span class="topbar__title">${name}</span>`
        : html`<a class="topbar__title topbar__home" href=${href('/')}>${name}</a>`}
      ${inSession && html`<span class="topbar__session muted">In session</span>`}
      <span class="topbar__build muted" title="Build">${BUILD}</span>
      <${BackupBadge} onMessage=${setMessage} />
      <${Menu} onMessage=${setMessage} mode=${session.mode} onToggleSession=${toggleSession} />
    </header>
    ${nudge && html`<${EndNudge} status=${nudge} onMessage=${setMessage} onClose=${() => setNudge(null)} />`}
    ${message && html`
      <p class=${`message badge badge--${message.kind}`} role="status" onClick=${() => setMessage(null)}>${message.text}</p>
    `}
    ${inSession
      ? html`<${CaptureScreen} pcId=${pcId} onMessage=${setMessage} />`
      : html`<${OutScreen} pcId=${pcId} pc=${pc} onMessage=${setMessage} />`}
  `;
}
