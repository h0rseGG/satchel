// In/out of session (SPEC 6). Pure.

export const AUTO_END_MS = 12 * 3600 * 1000;

export const outOfSession = (now) => ({ mode: 'out', mode_since: now });
export const startSession = (now) => ({ mode: 'in', mode_since: now });
export const endSession = (now) => ({ mode: 'out', mode_since: now });

export const noteMode = (state) => (state?.mode === 'in' ? 'in' : 'out');

// Ends after 12 h with no in-session note and no mode change.
// lastInNoteAt: created_at of the newest note written in session (or null).
export function shouldAutoEnd(state, lastInNoteAt, now) {
  if (state?.mode !== 'in') return false;
  const last = [state.mode_since, lastInNoteAt].filter(Boolean).reduce((a, b) => (a > b ? a : b), '');
  if (!last) return true;
  return Date.parse(now) - Date.parse(last) >= AUTO_END_MS;
}
