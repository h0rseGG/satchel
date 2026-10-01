import { useEffect, useState } from 'preact/hooks';
import { html } from './html.js';
import { useLive } from './useLive.js';
import { backupMeta } from '../db.js';
import { backupStatus } from '../backup.js';
import { formatShort } from './format.js';
import { packAndDownload } from './pack.js';

// Backup status in the top bar (rules in js/backup.js). Tap to pack a kit.
export function BackupBadge({ onMessage }) {
  const meta = useLive(backupMeta, [], undefined);

  // Re-check once a minute, so the colour ages while the app stays open.
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  if (meta === undefined) return null;
  const { kind, text } = backupStatus(meta, nowMs);
  const last = meta.last_backup_at ? `Last kit packed ${formatShort(meta.last_backup_at)}. ` : '';
  // On a narrow screen "since backup" is hidden (CSS), leaving "3 changes".
  const SUFFIX = ' since backup';
  const [head, tail] = text.endsWith(SUFFIX) ? [text.slice(0, -SUFFIX.length), SUFFIX] : [text, ''];
  return html`
    <button type="button" class=${`badge badge--${kind} badge--button`}
      title=${`${last}Tap to pack a kit.`} aria-label=${`${text}. Tap to pack a kit.`}
      onClick=${() => packAndDownload(onMessage)}>
      ${head}${tail && html`<span class="badge__long">${tail}</span>`}
    </button>
  `;
}
