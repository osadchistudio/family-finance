import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const RECEIPT_IMAGE_UPLOAD_MAX_BYTES = 12 * 1024 * 1024;
const RECEIPT_STORAGE_ROOT = path.join(process.cwd(), 'runtime-data');

export class ReceiptImageUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReceiptImageUploadError';
  }
}

function sanitizeFilenamePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'receipt';
}

export function getReceiptStorageRootDir() {
  return RECEIPT_STORAGE_ROOT;
}

export function getReceiptImageAbsolutePath(storageKey: string) {
  return path.join(RECEIPT_STORAGE_ROOT, storageKey);
}

function inferExtension(file: File) {
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/heic') return 'heic';
  if (file.type === 'image/heif') return 'heif';
  if (file.type === 'image/webp') return 'webp';

  const nameParts = file.name.split('.');
  const fallback = nameParts.length > 1 ? nameParts.at(-1) : null;
  return sanitizeFilenamePart(fallback || 'jpg');
}

function ensureImageFile(file: File) {
  if (!file.type.startsWith('image/')) {
    throw new ReceiptImageUploadError('Only image uploads are supported');
  }
}

export async function saveReceiptImage(receiptId: string, file: File) {
  ensureImageFile(file);

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength === 0) {
    throw new ReceiptImageUploadError('Uploaded image is empty');
  }

  if (buffer.byteLength > RECEIPT_IMAGE_UPLOAD_MAX_BYTES) {
    throw new ReceiptImageUploadError('Uploaded image is too large');
  }

  const extension = inferExtension(file);
  const baseName = sanitizeFilenamePart(path.parse(file.name).name);
  const storageDir = path.join(RECEIPT_STORAGE_ROOT, 'receipts', receiptId);
  const filename = `${Date.now()}-${baseName}.${extension}`;
  const absolutePath = path.join(storageDir, filename);

  await mkdir(storageDir, { recursive: true });
  await writeFile(absolutePath, buffer);

  return {
    imageStorageKey: path.join('receipts', receiptId, filename).replaceAll(path.sep, '/'),
    mimeType: file.type,
    sizeBytes: buffer.byteLength,
    originalFilename: file.name,
  };
}
