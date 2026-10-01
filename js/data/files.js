// Files and their bytes (SPEC 3.6). Images are re-encoded in the browser: WebP at
// quality 0.85 (JPEG where WebP encoding isn't available), longest side 2560 px.
// Re-encoding through a canvas also drops photo metadata (location, camera).
import { db } from './db.js';
import { saveMany } from './store.js';
import { makeRecord, isoNow, tombstone } from '../core/model.js';
import { save } from './store.js';
import { classifyUpload, isValidUtf8, fitWithin, WEBP_QUALITY, extFor, stripExt } from '../core/files-rules.js';

// The stored bytes as a Blob with the file's type, or null.
export async function getBlob(fileId) {
  const [file, row] = await Promise.all([db().files.get(fileId), db().blobs.get(fileId)]);
  if (!file || file.deleted || !row) return null;
  return row.data instanceof Blob ? row.data : new Blob([row.data], { type: file.mime });
}

export class UploadError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

async function encodeImage(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new UploadError('unreadable');
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const toBlob = (type) => new Promise((r) => canvas.toBlob(r, type, WEBP_QUALITY));
  let blob = await toBlob('image/webp');
  // Browsers that can't encode WebP hand back PNG instead: use JPEG then.
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg');
  if (!blob) throw new UploadError('unreadable');
  return { blob, width, height };
}

// file: a File from a picker. Checks it in code (no `accept` filter: Android greys files out).
// Returns the new file record. Throws UploadError(reason).
export async function addFile(file, { entityId = null, now = isoNow() } = {}) {
  const check = classifyUpload({ name: file.name, type: file.type, size: file.size });
  if (!check.ok) throw new UploadError(check.reason);
  let blob;
  let meta;
  if (check.kind === 'image') {
    const img = await encodeImage(file);
    blob = img.blob;
    meta = { kind: 'image', mime: blob.type, width: img.width, height: img.height, name: `${stripExt(file.name)}.${extFor(blob.type)}` };
  } else {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isValidUtf8(bytes)) throw new UploadError('not-utf8');
    blob = new Blob([bytes], { type: check.mime });
    meta = { kind: 'text', mime: check.mime, width: null, height: null, name: file.name };
  }
  const record = makeRecord('files', { ...meta, entity_id: entityId, size: blob.size, caption: '' }, { now });
  await db().transaction('rw', ['files', 'blobs', 'entities', 'types', 'notes', 'relationships', 'meta'], async () => {
    await db().blobs.put({ id: record.id, data: blob });
    await saveMany([{ table: 'files', record }], { now });
  });
  return record;
}

export async function getFileRecord(id) {
  return db().files.get(id);
}

const newestFirst = (a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0);

export async function allFiles(limit = Infinity) {
  return (await db().files.filter((f) => !f.deleted).toArray()).sort(newestFirst).slice(0, limit);
}

export async function filesOf(entityId) {
  return (await db().files.where('entity_id').equals(entityId).filter((f) => !f.deleted).toArray()).sort(newestFirst);
}

// patch: { name, caption, entity_id }
export async function updateFile(id, patch, { now = isoNow() } = {}) {
  const f = await db().files.get(id);
  await save('files', { ...f, ...patch, updated_at: now }, { now });
}

// Tombstone the record, drop the bytes, and clear any picture that used it.
export async function deleteFile(id, { now = isoNow() } = {}) {
  const d = db();
  await d.transaction('rw', ['files', 'blobs', 'entities', 'types', 'notes', 'relationships', 'meta'], async () => {
    const f = await d.files.get(id);
    if (!f || f.deleted) return;
    const users = await d.entities.filter((e) => e.portrait_file_id === id).toArray();
    await saveMany([
      { table: 'files', record: tombstone(f, now) },
      ...users.map((e) => ({ table: 'entities', record: { ...e, portrait_file_id: null, updated_at: now } })),
    ], { now });
    await d.blobs.delete(id);
  });
}
