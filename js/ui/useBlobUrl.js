import { useState, useEffect } from 'preact/hooks';
import { getBlob } from '../data/files.js';

// An object URL for a stored file, revoked when the component goes away.
export function useBlobUrl(fileId) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    setUrl(null);
    if (!fileId) return undefined;
    let u = null;
    let live = true;
    getBlob(fileId).then((b) => {
      if (!live || !b) return;
      u = URL.createObjectURL(b);
      setUrl(u);
    });
    return () => {
      live = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [fileId]);
  return url;
}
