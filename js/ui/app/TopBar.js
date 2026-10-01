import { useState, useEffect, useRef } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';
import { VERSION } from '../../version.js';
import { href } from './router.js';
import { badge } from '../../core/backup.js';
import { toast } from './toasts.js';

// One line, always (SPEC 5.1). On phones the crumbs move to their own line (Crumbs below).
export function TopBar({ name, crumbs, session, backup, onToggleSession, hasCharacter, onHome, overviewOpen }) {
  const inSession = session?.mode === 'in';
  return html`
    <header class="topbar">
      <a class="topbar-home" href=${href('home')} title=${onHome ? S.overview.open : name || S.appName} onClick=${onHome} aria-expanded=${onHome ? (overviewOpen ? 'true' : 'false') : undefined}>${name || S.appName}</a>
      <nav class="topbar-crumbs" aria-label=${S.nav.crumbs}><${CrumbTrail} crumbs=${crumbs} /></nav>
      ${hasCharacter && html`
        <button type="button" class=${`btn btn-secondary session-btn${inSession ? ' is-on' : ''}`} aria-pressed=${inSession ? 'true' : 'false'} onClick=${onToggleSession}>
          ${inSession ? html`<span class="seal" aria-hidden="true"></span>${S.session.inSession}` : html`<span class="long">${S.session.start}</span><span class="short">${S.session.startShort}</span>`}
        </button>
        <${BackupBadge} backup=${backup} />`}
      <${Menu} hasCharacter=${hasCharacter} />
    </header>
    ${crumbs.length > 0 && html`<nav class="crumbline" aria-label=${S.nav.crumbs}><${CrumbTrail} crumbs=${crumbs} /></nav>`}`;
}

function CrumbTrail({ crumbs }) {
  const all = [{ label: S.nav.home, href: href('home') }, ...crumbs];
  if (!crumbs.length) return null;
  return all.map((c, i) => html`${i > 0 && html`<span class="crumb-sep" aria-hidden="true"> › </span>`}${c.href && i < all.length - 1 ? html`<a href=${c.href}>${c.label}</a>` : html`<span aria-current=${i === all.length - 1 ? 'page' : undefined}>${c.label}</span>`}`);
}

// Re-checked every minute: the colour depends on how old the first unsaved change is.
function BackupBadge({ backup }) {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toISOString()), 60_000);
    return () => clearInterval(t);
  }, []);
  if (!backup) return null;
  const b = badge(backup, now);
  const text = b.level === 'ok' ? S.badge.backedUp : b.changes === 0 ? S.badge.notBackedUp : html`${S.badge.changes(b.changes)}<span class="long">${S.badge.sinceBackup}</span>`;
  return html`<button type="button" class=${`badge badge-${b.level}`} title=${S.badge.title} onClick=${() => toast(S.later(S.menu.packKit))}>${text}</button>`;
}

function Menu({ hasCharacter }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const item = (label, action) => html`<button type="button" role="menuitem" class="menu-item" onClick=${() => { setOpen(false); action(); }}>${label}</button>`;
  const later = (what) => () => toast(S.later(what));
  return html`
    <div class="menu-wrap" ref=${ref}>
      <button type="button" class="btn btn-secondary" aria-haspopup="menu" aria-expanded=${open ? 'true' : 'false'} onClick=${() => setOpen(!open)}>${S.menu.open}</button>
      ${open && html`
        <div class="menu" role="menu" aria-label=${S.menu.open}>
          ${hasCharacter && item(S.menu.packKit, later(S.menu.packKit))}
          ${item(S.menu.unpackKit, later(S.menu.unpackKit))}
          ${item(S.menu.help, later(S.menu.help))}
          ${hasCharacter && item(S.menu.settings, () => { location.hash = href('settings'); })}
          ${hasCharacter && item(S.menu.newCharacter, later(S.menu.newCharacter))}
          <div class="menu-version">${S.version(VERSION)}</div>
        </div>`}
    </div>`;
}
