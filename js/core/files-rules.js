// Upload rules for files (SPEC 3.6). Pure: the browser side does the decoding and encoding.

export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_SIDE = 2560;
export const WEBP_QUALITY = 0.85;

const EXT_BY_MIME = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'text/plain': 'txt', 'text/markdown': 'md' };
export const extFor = (mime) => EXT_BY_MIME[mime] ?? null;
export const STORED_MIMES = Object.keys(EXT_BY_MIME);

// SVG is refused: it can carry scripts, and nothing at the table needs it.
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/avif'];

// Decides from name, type and size only; no `accept` filter on the picker, because
// Android greys out files it doesn't recognise (SPEC 2).
export function classifyUpload({ name = '', type = '', size = 0 }) {
  if (size > MAX_BYTES) return { ok: false, reason: 'too-big' };
  if (size === 0) return { ok: false, reason: 'empty' };
  const ext = (name.match(/\.([^.]+)$/)?.[1] ?? '').toLowerCase();
  if (IMAGE_MIMES.includes(type)) return { ok: true, kind: 'image' };
  if (ext === 'txt' || ext === 'md') return { ok: true, kind: 'text', mime: ext === 'md' ? 'text/markdown' : 'text/plain' };
  return { ok: false, reason: 'unsupported' };
}

export function isValidUtf8(bytes) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

// Longest side at most MAX_SIDE, keeping the aspect ratio; never upscales.
export function fitWithin(width, height, max = MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function stripExt(name) {
  return name.replace(/\.[^.]+$/, '');
}
