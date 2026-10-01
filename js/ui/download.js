// Save bytes as a file via the browser's normal download.
// octet-stream rather than application/zip, so browsers are less tempted
// to rename "x.kit" to "x.kit.zip".
export function downloadBytes(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
