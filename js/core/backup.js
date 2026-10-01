// Backup status and the top-bar badge (SPEC 7.3). Pure.

const HOUR = 3600 * 1000;
export const GREY_FOR_MS = 24 * HOUR;
export const RED_AFTER_MS = 7 * 24 * HOUR;

export const emptyBackupMeta = () => ({ last_backup_at: null, changes_since_backup: 0, first_change_at: null });

// n user edits saved. Merged-in data never comes through here (v1 lesson 5).
export function recordChanges(meta, n, now) {
  if (n <= 0) return meta;
  return { ...meta, changes_since_backup: (meta.changes_since_backup || 0) + n, first_change_at: meta.first_change_at ?? now };
}

// Called once the export has been handed to the browser, not when the download "starts" (v1 lesson 7).
export function recordBackup(meta, at) {
  return { ...meta, last_backup_at: at, changes_since_backup: 0, first_change_at: null };
}

// { level: 'ok' | 'grey' | 'warn' | 'err', changes, never }
export function badge(meta, now) {
  const changes = meta.changes_since_backup || 0;
  const never = !meta.last_backup_at;
  if (!never && changes === 0) return { level: 'ok', changes, never };
  const age = meta.first_change_at ? Date.parse(now) - Date.parse(meta.first_change_at) : 0;
  let level = age >= RED_AFTER_MS ? 'err' : age >= GREY_FOR_MS ? 'warn' : 'grey';
  if (never) level = 'err';
  return { level, changes, never };
}

export const shouldNudge = (meta) => (meta.changes_since_backup || 0) > 0;
