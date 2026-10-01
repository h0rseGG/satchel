import { packCurrentKit, markBackedUp } from '../db.js';
import { downloadBytes } from './download.js';

// Pack a kit, download it, and reset the backup badge. Used by the menu,
// the badge, and the end-of-session nudge. Reports through onMessage.
export async function packAndDownload(onMessage) {
  try {
    const { bytes, filename } = await packCurrentKit();
    downloadBytes(bytes, filename);
    await markBackedUp();
    onMessage({ kind: 'ok', text: `Kit packed: ${filename}` });
  } catch (err) {
    onMessage({ kind: 'err', text: `Couldn't pack kit: ${err.message}` });
  }
}
