// Rules for attached files (SPEC section 7). Pure, unit tested with node.
// Allowed: images (re-encoded on upload) and plain text (.txt, .md).

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 2560;

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;
const TEXT_EXT = /\.(txt|md)$/i;

// What kind of upload this is, from its name and browser-reported type:
// 'image', 'text', or null (not allowed).
export function classify(name, type = '') {
  if (type.startsWith('image/') || IMAGE_EXT.test(name)) return 'image';
  if (TEXT_EXT.test(name)) return 'text';
  if (type === 'text/plain' || type === 'text/markdown') return 'text';
  return null;
}

// Extension used for the file inside a kit / the sync repo.
export function fileExt(file) {
  if (file.kind === 'image') return file.mime === 'image/jpeg' ? 'jpg' : 'webp';
  return /\.md$/i.test(file.name ?? '') ? 'md' : 'txt';
}

export const FILE_PATH = /^files\/([0-9a-f-]{36})\.(webp|jpg|txt|md)$/;

// Shrink to fit MAX_IMAGE_EDGE on the long side, keeping the shape.
export function fitSize(width, height, max = MAX_IMAGE_EDGE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// "12345678" -> "11.8 MB"
export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
