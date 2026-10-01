// Backup status rules (SPEC section 6). Pure, unit tested with node.
//   ok      backed up, nothing changed since
//   neutral changes, the oldest less than 24 h old
//   warn    oldest unsaved change over 24 h old
//   err     never backed up, or oldest unsaved change over 7 days old
// "Changes" = edits made on this device that aren't in any kit yet.

const HOUR = 60 * 60 * 1000;
export const WARN_AFTER = 24 * HOUR;
export const ERR_AFTER = 7 * 24 * HOUR;

// meta: { last_backup_at, changes_since_backup, first_change_at }
// Returns { kind, text }.
export function backupStatus(meta, nowMs = Date.now()) {
  const changes = meta.changes_since_backup ?? 0;
  if (!meta.last_backup_at) return { kind: 'err', text: 'Not backed up' };
  if (!changes) return { kind: 'ok', text: 'Backed up' };

  const text = `${changes} change${changes === 1 ? '' : 's'} since backup`;
  // Older data may lack first_change_at: fall back to the last backup time,
  // which is earlier, so the warning errs on the side of showing.
  const since = Date.parse(meta.first_change_at ?? meta.last_backup_at);
  const age = nowMs - since;
  if (age > ERR_AFTER) return { kind: 'err', text };
  if (age > WARN_AFTER) return { kind: 'warn', text };
  return { kind: 'neutral', text };
}
