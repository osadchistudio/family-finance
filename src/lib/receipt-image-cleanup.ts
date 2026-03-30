import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import {
  deleteReceiptImageStorageKey,
  removeEmptyLocalReceiptDirs,
} from './receipt-image-storage';

const DEFAULT_RETENTION_DAYS = 45;
const CLEANABLE_STATUSES = ['COMPLETED', 'FAILED'] as const;

type CleanableReceiptStatus = typeof CLEANABLE_STATUSES[number];

type CleanupCandidateRow = {
  id: string;
  imageStorageKey: string | null;
  thumbnailStorageKey: string | null;
  status: CleanableReceiptStatus;
  updatedAt: Date | string;
};

export interface ReceiptImageCleanupOptions {
  retentionDays?: number;
  dryRun?: boolean;
}

export interface ReceiptImageCleanupResult {
  retentionDays: number;
  cutoffIso: string;
  dryRun: boolean;
  candidates: number;
  cleanedReceipts: number;
  deletedFiles: number;
  reclaimedBytes: number;
  missingFiles: number;
}

export class ReceiptImageCleanupDomainNotReadyError extends Error {
  constructor(message = 'Receipt domain migration has not been applied yet') {
    super(message);
    this.name = 'ReceiptImageCleanupDomainNotReadyError';
  }
}

function normalizeDbCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const record = error as Record<string, unknown>;
  if (typeof record.code === 'string') return record.code;
  const meta = record.meta;
  if (meta && typeof meta === 'object') {
    const metaRecord = meta as Record<string, unknown>;
    if (typeof metaRecord.code === 'string') return metaRecord.code;
  }
  return null;
}

function normalizeCleanupError(error: unknown): never {
  const code = normalizeDbCode(error);
  const message = error instanceof Error ? error.message : String(error);

  if (
    code === '42P01'
    || code === '42704'
    || (
      code === 'P2010'
      && (
        message.includes('"Receipt"')
        || message.includes('"ReceiptItem"')
        || message.includes('"Store"')
      )
    )
  ) {
    throw new ReceiptImageCleanupDomainNotReadyError();
  }

  throw error;
}

function getRetentionDays(options?: ReceiptImageCleanupOptions) {
  const configured = options?.retentionDays
    ?? Number(process.env.RECEIPT_IMAGE_RETENTION_DAYS || DEFAULT_RETENTION_DAYS);

  if (!Number.isFinite(configured) || configured < 1) {
    return DEFAULT_RETENTION_DAYS;
  }

  return Math.floor(configured);
}

export async function runReceiptImageCleanup(options: ReceiptImageCleanupOptions = {}) {
  try {
    const retentionDays = getRetentionDays(options);
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const dryRun = options.dryRun ?? false;

    const candidates = await prisma.$queryRaw<CleanupCandidateRow[]>(Prisma.sql`
      SELECT
        id,
        "imageStorageKey",
        "thumbnailStorageKey",
        status::text AS status,
        "updatedAt"
      FROM "Receipt"
      WHERE status IN (${Prisma.join(CLEANABLE_STATUSES.map(status => Prisma.sql`${status}::"ReceiptStatus"`), ', ')})
        AND "updatedAt" < ${cutoffDate}
        AND ("imageStorageKey" IS NOT NULL OR "thumbnailStorageKey" IS NOT NULL)
      ORDER BY "updatedAt" ASC
    `);

    let cleanedReceipts = 0;
    let deletedFiles = 0;
    let reclaimedBytes = 0;
    let missingFiles = 0;

    for (const candidate of candidates) {
      const storageKeys = [
        candidate.imageStorageKey,
        candidate.thumbnailStorageKey,
      ].filter((key): key is string => Boolean(key));

      if (storageKeys.length === 0) {
        continue;
      }

      const uniqueStorageKeys = Array.from(new Set(storageKeys));
      let deletedForReceipt = 0;

      for (const storageKey of uniqueStorageKeys) {
        const result = await deleteReceiptImageStorageKey(storageKey, { dryRun });
        if (result.existed) {
          deletedFiles += 1;
          deletedForReceipt += 1;
          reclaimedBytes += result.sizeBytes;
        } else {
          missingFiles += 1;
        }
      }

      if (!dryRun) {
        await prisma.$executeRaw(Prisma.sql`
          UPDATE "Receipt"
          SET
            "imageStorageKey" = NULL,
            "thumbnailStorageKey" = NULL,
            "updatedAt" = NOW()
          WHERE id = ${candidate.id}
        `);
      }

      await removeEmptyLocalReceiptDirs(uniqueStorageKeys, dryRun);
      if (deletedForReceipt > 0 || uniqueStorageKeys.length > 0) {
        cleanedReceipts += 1;
      }
    }

    return {
      retentionDays,
      cutoffIso: cutoffDate.toISOString(),
      dryRun,
      candidates: candidates.length,
      cleanedReceipts,
      deletedFiles,
      reclaimedBytes,
      missingFiles,
    } satisfies ReceiptImageCleanupResult;
  } catch (error) {
    normalizeCleanupError(error);
  }
}
