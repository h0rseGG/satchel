import { html } from './html.js';
import { useLive } from './useLive.js';
import { getMeta } from '../db.js';
import { formatShort } from './format.js';

// Basic backup status. The full 24 h / 7 day colour rules come in step 9.
export function BackupBadge() {
  const last = useLive(() => getMeta('last_backup_at'), [], undefined);
  const changes = useLive(() => getMeta('changes_since_backup', 0), [], 0);
  if (last === undefined) return null;
  if (!last) return html`<span class="badge badge--err">Not backed up</span>`;
  const kind = changes ? 'warn' : 'ok';
  return html`<span class=${`badge badge--${kind}`} title=${`Last kit packed ${formatShort(last)}`}>
    ${changes ? `${changes} change${changes === 1 ? '' : 's'} since backup` : 'Backed up'}
  </span>`;
}
