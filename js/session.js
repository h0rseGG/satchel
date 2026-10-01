// In / Out of session mode (SPEC D2). Pure, unit tested with node.
// The mode is local to this device (meta), and each note records the mode
// it was written in. No session records or numbers for now.

export const AUTO_END_AFTER = 12 * 60 * 60 * 1000;

// True when an In session has had no activity for 12 h: no in-session note
// and no mode change. meta: { mode, mode_since }; lastInNoteAt: ISO or null.
export function shouldAutoEnd(meta, lastInNoteAt, nowMs = Date.now()) {
  if (meta.mode !== 'in') return false;
  const times = [meta.mode_since, lastInNoteAt].filter(Boolean).map(Date.parse);
  if (!times.length) return false;
  return nowMs - Math.max(...times) > AUTO_END_AFTER;
}
