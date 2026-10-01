// Turn a picked File into what addFile() stores (SPEC section 7, Files).
// Images are re-encoded to WebP (JPEG if the browser can't write WebP),
// at most MAX_IMAGE_EDGE px on the long side. Re-encoding also drops photo
// metadata such as GPS location. Text files (.txt, .md) are stored as-is
// after checking they really are text.
import { MAX_FILE_BYTES, classify, fitSize, formatSize } from './fileRules.js';

export async function prepareUpload(file) {
  const kind = classify(file.name, file.type);
  if (!kind) throw new Error(`${file.name}: only images, .txt and .md files can be added.`);
  return kind === 'image' ? prepareImage(file) : prepareText(file);
}

async function prepareText(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is ${formatSize(file.size)}; the limit is ${formatSize(MAX_FILE_BYTES)}.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${file.name} doesn't look like a text file.`);
  }
  const md = /\.md$/i.test(file.name) || file.type === 'text/markdown';
  return { name: file.name, kind: 'text', mime: md ? 'text/markdown' : 'text/plain', size: bytes.length, bytes };
}

async function prepareImage(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`Can’t read ${file.name} as an image. (iPhone HEIC photos aren’t supported; export them as JPEG.)`);
  }
  const { width, height } = fitSize(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  let blob = await toBlob(canvas, 'image/webp', 0.85);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', 0.85);
  if (!blob) throw new Error(`Couldn’t process ${file.name}.`);
  if (blob.size > MAX_FILE_BYTES) {
    throw new Error(`${file.name} is still ${formatSize(blob.size)} after shrinking; the limit is ${formatSize(MAX_FILE_BYTES)}.`);
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { name: file.name, kind: 'image', mime: blob.type, size: bytes.length, width, height, bytes };
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
