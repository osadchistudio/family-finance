import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const RECEIPT_IMAGE_UPLOAD_MAX_BYTES = 12 * 1024 * 1024;
const RECEIPT_STORAGE_ROOT = path.join(process.cwd(), 'runtime-data');
const DEFAULT_STORAGE_BACKEND = 'local';

type ReceiptImageStorageBackend = 'local' | 'supabase';

type LocalStorageKey = {
  backend: 'local';
  path: string;
};

type SupabaseStorageKey = {
  backend: 'supabase';
  bucket: string;
  path: string;
};

export type ParsedReceiptStorageKey = LocalStorageKey | SupabaseStorageKey;

type ReceiptImageStorageConfig =
  | {
      backend: 'local';
    }
  | {
      backend: 'supabase';
      supabaseUrl: string;
      serviceRoleKey: string;
      bucket: string;
    };

const globalForReceiptImageStorage = globalThis as unknown as {
  receiptImageSupabaseClient?: SupabaseClient;
};

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

function resolveSupabaseUrl() {
  const explicitUrl = process.env.SUPABASE_URL?.trim();
  if (explicitUrl) {
    return explicitUrl.replace(/\/$/, '');
  }

  const projectRef = process.env.SUPABASE_PROJECT_REF?.trim();
  if (projectRef) {
    return `https://${projectRef}.supabase.co`;
  }

  return null;
}

function getStorageBackend(): ReceiptImageStorageBackend {
  const configured = process.env.RECEIPT_IMAGE_STORAGE_BACKEND?.trim().toLowerCase();
  if (!configured) {
    return DEFAULT_STORAGE_BACKEND;
  }

  if (configured === 'local' || configured === 'supabase') {
    return configured;
  }

  throw new ReceiptImageUploadError('RECEIPT_IMAGE_STORAGE_BACKEND must be local or supabase');
}

function getReceiptImageStorageConfig(): ReceiptImageStorageConfig {
  const backend = getStorageBackend();

  if (backend === 'local') {
    return { backend };
  }

  const supabaseUrl = resolveSupabaseUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
  const bucket = process.env.SUPABASE_RECEIPTS_BUCKET?.trim() || null;

  if (!supabaseUrl || !serviceRoleKey || !bucket) {
    throw new ReceiptImageUploadError(
      'Supabase Storage requires SUPABASE_URL (or SUPABASE_PROJECT_REF), SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_RECEIPTS_BUCKET'
    );
  }

  return {
    backend,
    supabaseUrl,
    serviceRoleKey,
    bucket,
  };
}

function getSupabaseStorageClient(config: Extract<ReceiptImageStorageConfig, { backend: 'supabase' }>) {
  if (!globalForReceiptImageStorage.receiptImageSupabaseClient) {
    globalForReceiptImageStorage.receiptImageSupabaseClient = createClient(
      config.supabaseUrl,
      config.serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }

  return globalForReceiptImageStorage.receiptImageSupabaseClient;
}

function formatLocalStorageKey(relativePath: string) {
  return `local://${relativePath.replaceAll(path.sep, '/')}`;
}

function formatSupabaseStorageKey(bucket: string, storagePath: string) {
  return `supabase://${bucket}/${storagePath}`;
}

export function parseReceiptStorageKey(storageKey: string): ParsedReceiptStorageKey {
  if (storageKey.startsWith('supabase://')) {
    const withoutPrefix = storageKey.slice('supabase://'.length);
    const firstSlashIndex = withoutPrefix.indexOf('/');
    if (firstSlashIndex === -1) {
      throw new ReceiptImageUploadError('Invalid Supabase receipt image storage key');
    }

    return {
      backend: 'supabase',
      bucket: withoutPrefix.slice(0, firstSlashIndex),
      path: withoutPrefix.slice(firstSlashIndex + 1),
    };
  }

  if (storageKey.startsWith('local://')) {
    return {
      backend: 'local',
      path: storageKey.slice('local://'.length),
    };
  }

  return {
    backend: 'local',
    path: storageKey,
  };
}

export function getReceiptStorageRootDir() {
  return RECEIPT_STORAGE_ROOT;
}

export function getReceiptImageAbsolutePath(storageKey: string) {
  const parsed = parseReceiptStorageKey(storageKey);
  if (parsed.backend !== 'local') {
    throw new ReceiptImageUploadError('Supabase-backed storage keys do not map to local filesystem paths');
  }

  return path.join(RECEIPT_STORAGE_ROOT, parsed.path);
}

async function safeLocalFileSize(absolutePath: string) {
  try {
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) return 0;
    return fileStat.size;
  } catch {
    return 0;
  }
}

export async function deleteReceiptImageStorageKey(
  storageKey: string,
  options: { dryRun?: boolean } = {}
) {
  const parsed = parseReceiptStorageKey(storageKey);
  const dryRun = options.dryRun ?? false;

  if (parsed.backend === 'supabase') {
    const config = getReceiptImageStorageConfig();
    if (config.backend !== 'supabase') {
      throw new ReceiptImageUploadError('Cannot delete Supabase receipt image without Supabase storage configuration');
    }

    if (!dryRun) {
      const client = getSupabaseStorageClient(config);
      const { error } = await client.storage.from(parsed.bucket).remove([parsed.path]);
      if (error) {
        throw new ReceiptImageUploadError(`Failed to delete Supabase receipt image: ${error.message}`);
      }
    }

    return {
      existed: true,
      sizeBytes: 0,
      backend: parsed.backend,
    };
  }

  const absolutePath = path.join(RECEIPT_STORAGE_ROOT, parsed.path);
  const sizeBytes = await safeLocalFileSize(absolutePath);
  const existed = sizeBytes > 0;

  if (existed && !dryRun) {
    await rm(absolutePath, { force: true });
  }

  return {
    existed,
    sizeBytes,
    backend: parsed.backend,
  };
}

export async function removeEmptyLocalReceiptDirs(storageKeys: string[], dryRun: boolean) {
  const root = getReceiptStorageRootDir();
  const dirs = new Set<string>();

  for (const storageKey of storageKeys) {
    const parsed = parseReceiptStorageKey(storageKey);
    if (parsed.backend !== 'local') {
      continue;
    }

    const absolutePath = path.join(RECEIPT_STORAGE_ROOT, parsed.path);
    const dirPath = path.dirname(absolutePath);
    const relativeDir = path.relative(root, dirPath);

    if (!relativeDir.startsWith('..')) {
      dirs.add(dirPath);
    }
  }

  const sortedDirs = Array.from(dirs).sort((left, right) => right.length - left.length);
  for (const dir of sortedDirs) {
    if (!dryRun) {
      await rm(dir, { recursive: false, force: true }).catch(() => undefined);
    }
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
  const filename = `${Date.now()}-${baseName}.${extension}`;
  const storagePath = path.join('receipts', receiptId, filename).replaceAll(path.sep, '/');
  const config = getReceiptImageStorageConfig();

  if (config.backend === 'supabase') {
    const client = getSupabaseStorageClient(config);
    const { error } = await client.storage
      .from(config.bucket)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
        cacheControl: '31536000',
      });

    if (error) {
      throw new ReceiptImageUploadError(`Supabase upload failed: ${error.message}`);
    }

    return {
      imageStorageKey: formatSupabaseStorageKey(config.bucket, storagePath),
      mimeType: file.type,
      sizeBytes: buffer.byteLength,
      originalFilename: file.name,
      backend: config.backend,
    };
  }

  const storageDir = path.join(RECEIPT_STORAGE_ROOT, 'receipts', receiptId);
  const absolutePath = path.join(storageDir, filename);

  await mkdir(storageDir, { recursive: true });
  await writeFile(absolutePath, buffer);

  return {
    imageStorageKey: formatLocalStorageKey(storagePath),
    mimeType: file.type,
    sizeBytes: buffer.byteLength,
    originalFilename: file.name,
    backend: config.backend,
  };
}
