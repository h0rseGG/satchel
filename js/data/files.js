// Files and their bytes.
import { db } from './db.js';

// The stored bytes as a Blob with the file's type, or null.
export async function getBlob(fileId) {
  const [file, row] = await Promise.all([db().files.get(fileId), db().blobs.get(fileId)]);
  if (!file || !row) return null;
  return row.data instanceof Blob ? row.data : new Blob([row.data], { type: file.mime });
}
