import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const RECEIPT_STATUSES = [
  'PENDING_UPLOAD',
  'PROCESSING',
  'NEEDS_REVIEW',
  'COMPLETED',
  'FAILED',
] as const;

export type ReceiptStatus = typeof RECEIPT_STATUSES[number];

export const RECEIPT_ITEM_REVIEW_STATUSES = [
  'UNREVIEWED',
  'CONFIRMED',
  'EDITED',
  'REJECTED',
] as const;

export type ReceiptItemReviewStatus = typeof RECEIPT_ITEM_REVIEW_STATUSES[number];

export interface ReceiptStoreSummary {
  id: string;
  name: string;
  chain: string | null;
  branchName: string | null;
  branchAddress: string | null;
}

export interface ReceiptListItem {
  id: string;
  storeId: string | null;
  storeName: string | null;
  storeChain: string | null;
  capturedAt: string;
  purchaseAt: string | null;
  totalAmount: number | null;
  currency: string;
  status: ReceiptStatus;
  imageStorageKey: string | null;
  thumbnailStorageKey: string | null;
  notes: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptItemDetail {
  id: string;
  productId: string | null;
  productCanonicalName: string | null;
  rawName: string;
  normalizedName: string | null;
  brand: string | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  linePrice: number | null;
  discountAmount: number | null;
  confidenceScore: number | null;
  reviewStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptDetail extends ReceiptListItem {
  parserVersion: string | null;
  parseError: string | null;
  rawOcrText: string | null;
  store: ReceiptStoreSummary | null;
  items: ReceiptItemDetail[];
}

export interface ListReceiptsOptions {
  statuses?: ReceiptStatus[];
  limit?: number;
  offset?: number;
}

export interface CreateReceiptInput {
  capturedAt?: Date;
  purchaseAt?: Date | null;
  totalAmount?: number | null;
  currency?: string;
  status?: ReceiptStatus;
  storeId?: string | null;
  storeName?: string | null;
  imageStorageKey?: string | null;
  thumbnailStorageKey?: string | null;
  rawOcrText?: string | null;
  parserVersion?: string | null;
  parseError?: string | null;
  notes?: string | null;
}

export interface UpdateReceiptInput {
  purchaseAt?: Date | null;
  totalAmount?: number | null;
  currency?: string;
  status?: ReceiptStatus;
  storeId?: string | null;
  storeName?: string | null;
  imageStorageKey?: string | null;
  thumbnailStorageKey?: string | null;
  rawOcrText?: string | null;
  parserVersion?: string | null;
  parseError?: string | null;
  notes?: string | null;
}

export interface ReceiptProcessInput extends UpdateReceiptInput {
  status?: ReceiptStatus;
}

export interface CreateReceiptItemInput {
  rawName: string;
  normalizedName?: string | null;
  brand?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  linePrice?: number | null;
  discountAmount?: number | null;
  confidenceScore?: number | null;
  reviewStatus?: ReceiptItemReviewStatus;
  productId?: string | null;
}

export interface UpdateReceiptItemInput {
  rawName?: string;
  normalizedName?: string | null;
  brand?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  linePrice?: number | null;
  discountAmount?: number | null;
  confidenceScore?: number | null;
  reviewStatus?: ReceiptItemReviewStatus;
  productId?: string | null;
}

type ReceiptRow = {
  id: string;
  storeId: string | null;
  storeName: string | null;
  storeChain: string | null;
  storeBranchName: string | null;
  storeBranchAddress: string | null;
  capturedAt: Date | string;
  purchaseAt: Date | string | null;
  totalAmount: Prisma.Decimal | string | number | null;
  currency: string;
  status: ReceiptStatus;
  imageStorageKey: string | null;
  thumbnailStorageKey: string | null;
  rawOcrText: string | null;
  parserVersion: string | null;
  parseError: string | null;
  notes: string | null;
  itemCount: number | bigint;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type ReceiptItemRow = {
  id: string;
  productId: string | null;
  productCanonicalName: string | null;
  rawName: string;
  normalizedName: string | null;
  brand: string | null;
  quantity: Prisma.Decimal | string | number | null;
  unit: string | null;
  unitPrice: Prisma.Decimal | string | number | null;
  linePrice: Prisma.Decimal | string | number | null;
  discountAmount: Prisma.Decimal | string | number | null;
  confidenceScore: number | null;
  reviewStatus: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type StoreRow = {
  id: string;
  name: string;
  chain: string | null;
  branchName: string | null;
  branchAddress: string | null;
};

const RECEIPT_SELECT = Prisma.sql`
  SELECT
    r.id,
    r."storeId",
    s.name AS "storeName",
    s.chain AS "storeChain",
    s."branchName" AS "storeBranchName",
    s."branchAddress" AS "storeBranchAddress",
    r."capturedAt",
    r."purchaseAt",
    r."totalAmount",
    r.currency,
    r.status::text AS status,
    r."imageStorageKey",
    r."thumbnailStorageKey",
    r."rawOcrText",
    r."parserVersion",
    r."parseError",
    r.notes,
    COALESCE(COUNT(i.id), 0)::int AS "itemCount",
    r."createdAt",
    r."updatedAt"
  FROM "Receipt" r
  LEFT JOIN "Store" s ON s.id = r."storeId"
  LEFT JOIN "ReceiptItem" i ON i."receiptId" = r.id
`;

export class ReceiptDomainNotReadyError extends Error {
  constructor(message = 'Receipt domain migration has not been applied yet') {
    super(message);
    this.name = 'ReceiptDomainNotReadyError';
  }
}

export class ReceiptInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReceiptInputError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwnField(record: Record<string, unknown>, field: string) {
  return Object.prototype.hasOwnProperty.call(record, field);
}

function normalizeNullableText(value: unknown, fieldName: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new ReceiptInputError(`${fieldName} must be a string`);
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeCurrency(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ReceiptInputError('currency must be a string');
  }

  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3,6}$/.test(normalized)) {
    throw new ReceiptInputError('currency must be a 3-6 letter code');
  }

  return normalized;
}

function normalizeNullableDate(value: unknown, fieldName: string): Date | null {
  if (value === null || value === '') return null;
  if (!(typeof value === 'string' || value instanceof Date)) {
    throw new ReceiptInputError(`${fieldName} must be a valid date`);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ReceiptInputError(`${fieldName} must be a valid date`);
  }

  return parsed;
}

function normalizeNonNegativeNumber(value: unknown, fieldName: string): number | null {
  if (value === null || value === '') return null;

  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : NaN;

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ReceiptInputError(`${fieldName} must be a non-negative number`);
  }

  return parsed;
}

function normalizeOptionalStatus(value: unknown): ReceiptStatus {
  if (typeof value !== 'string' || !RECEIPT_STATUSES.includes(value as ReceiptStatus)) {
    throw new ReceiptInputError(`status must be one of: ${RECEIPT_STATUSES.join(', ')}`);
  }

  return value as ReceiptStatus;
}

function normalizeOptionalReviewStatus(value: unknown): ReceiptItemReviewStatus {
  if (
    typeof value !== 'string'
    || !RECEIPT_ITEM_REVIEW_STATUSES.includes(value as ReceiptItemReviewStatus)
  ) {
    throw new ReceiptInputError(
      `reviewStatus must be one of: ${RECEIPT_ITEM_REVIEW_STATUSES.join(', ')}`
    );
  }

  return value as ReceiptItemReviewStatus;
}

function normalizeConfidenceScore(value: unknown, fieldName: string): number | null {
  if (value === null || value === '') return null;

  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : NaN;

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new ReceiptInputError(`${fieldName} must be between 0 and 1`);
  }

  return parsed;
}

function normalizeDbCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;

  const errorRecord = error as Record<string, unknown>;
  if (typeof errorRecord.code === 'string') {
    return errorRecord.code;
  }

  const meta = errorRecord.meta;
  if (meta && typeof meta === 'object') {
    const metaRecord = meta as Record<string, unknown>;
    if (typeof metaRecord.code === 'string') {
      return metaRecord.code;
    }
  }

  return null;
}

function normalizeReceiptPersistenceError(error: unknown): never {
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
    throw new ReceiptDomainNotReadyError();
  }

  throw error;
}

function toIsoString(value: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toNullableNumber(value: Prisma.Decimal | string | number | null) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

function mapReceiptRow(row: ReceiptRow): ReceiptListItem {
  return {
    id: row.id,
    storeId: row.storeId,
    storeName: row.storeName,
    storeChain: row.storeChain,
    capturedAt: toIsoString(row.capturedAt) ?? new Date(0).toISOString(),
    purchaseAt: toIsoString(row.purchaseAt),
    totalAmount: toNullableNumber(row.totalAmount),
    currency: row.currency,
    status: row.status,
    imageStorageKey: row.imageStorageKey,
    thumbnailStorageKey: row.thumbnailStorageKey,
    notes: row.notes,
    itemCount: Number(row.itemCount),
    createdAt: toIsoString(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date(0).toISOString(),
  };
}

function mapReceiptItemRow(row: ReceiptItemRow): ReceiptItemDetail {
  return {
    id: row.id,
    productId: row.productId,
    productCanonicalName: row.productCanonicalName,
    rawName: row.rawName,
    normalizedName: row.normalizedName,
    brand: row.brand,
    quantity: toNullableNumber(row.quantity),
    unit: row.unit,
    unitPrice: toNullableNumber(row.unitPrice),
    linePrice: toNullableNumber(row.linePrice),
    discountAmount: toNullableNumber(row.discountAmount),
    confidenceScore: row.confidenceScore,
    reviewStatus: row.reviewStatus,
    createdAt: toIsoString(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date(0).toISOString(),
  };
}

async function runReceiptQuery<T>(query: () => Promise<T>) {
  try {
    return await query();
  } catch (error) {
    normalizeReceiptPersistenceError(error);
  }
}

async function resolveStoreId(input: {
  storeId?: string | null;
  storeName?: string | null;
}) {
  const explicitStoreId = input.storeId === undefined
    ? undefined
    : input.storeId?.trim() || null;

  if (explicitStoreId !== undefined) {
    if (!explicitStoreId) {
      if (input.storeName && input.storeName.trim()) {
        return resolveStoreId({ storeName: input.storeName });
      }

      return null;
    }

    const existing = await prisma.$queryRaw<StoreRow[]>(Prisma.sql`
      SELECT id, name, chain, "branchName", "branchAddress"
      FROM "Store"
      WHERE id = ${explicitStoreId}
      LIMIT 1
    `);

    if (existing.length === 0) {
      throw new ReceiptInputError('Store not found');
    }

    return existing[0].id;
  }

  const normalizedStoreName = input.storeName?.trim();
  if (!normalizedStoreName) return null;

  const existingByName = await prisma.$queryRaw<StoreRow[]>(Prisma.sql`
    SELECT id, name, chain, "branchName", "branchAddress"
    FROM "Store"
    WHERE LOWER(name) = LOWER(${normalizedStoreName})
    ORDER BY "createdAt" ASC
    LIMIT 1
  `);

  if (existingByName.length > 0) {
    return existingByName[0].id;
  }

  const id = randomUUID();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "Store" (
      "id",
      "name",
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${id},
      ${normalizedStoreName},
      NOW(),
      NOW()
    )
  `);

  return id;
}

export function parseReceiptStatusesParam(rawValue: string | null) {
  if (!rawValue) return undefined;

  const statuses = rawValue
    .split(',')
    .map(status => status.trim())
    .filter(Boolean);

  if (statuses.length === 0) return undefined;

  const invalidStatuses = statuses.filter(
    status => !RECEIPT_STATUSES.includes(status as ReceiptStatus)
  );

  if (invalidStatuses.length > 0) {
    throw new ReceiptInputError(`Invalid receipt statuses: ${invalidStatuses.join(', ')}`);
  }

  return statuses as ReceiptStatus[];
}

export function parseCreateReceiptInput(body: unknown): CreateReceiptInput {
  if (!isRecord(body)) {
    throw new ReceiptInputError('Request body must be an object');
  }

  const input: CreateReceiptInput = {};

  if (hasOwnField(body, 'capturedAt')) {
    const capturedAt = normalizeNullableDate(body.capturedAt, 'capturedAt');
    if (!capturedAt) {
      throw new ReceiptInputError('capturedAt cannot be null');
    }
    input.capturedAt = capturedAt;
  }

  if (hasOwnField(body, 'purchaseAt')) {
    input.purchaseAt = normalizeNullableDate(body.purchaseAt, 'purchaseAt');
  }

  if (hasOwnField(body, 'totalAmount')) {
    input.totalAmount = normalizeNonNegativeNumber(body.totalAmount, 'totalAmount');
  }

  if (hasOwnField(body, 'currency')) {
    input.currency = normalizeCurrency(body.currency);
  }

  if (hasOwnField(body, 'status')) {
    input.status = normalizeOptionalStatus(body.status);
  }

  if (hasOwnField(body, 'storeId')) {
    input.storeId = normalizeNullableText(body.storeId, 'storeId');
  }

  if (hasOwnField(body, 'storeName')) {
    input.storeName = normalizeNullableText(body.storeName, 'storeName');
  }

  if (hasOwnField(body, 'imageStorageKey')) {
    input.imageStorageKey = normalizeNullableText(body.imageStorageKey, 'imageStorageKey');
  }

  if (hasOwnField(body, 'thumbnailStorageKey')) {
    input.thumbnailStorageKey = normalizeNullableText(body.thumbnailStorageKey, 'thumbnailStorageKey');
  }

  if (hasOwnField(body, 'rawOcrText')) {
    input.rawOcrText = normalizeNullableText(body.rawOcrText, 'rawOcrText');
  }

  if (hasOwnField(body, 'parserVersion')) {
    input.parserVersion = normalizeNullableText(body.parserVersion, 'parserVersion');
  }

  if (hasOwnField(body, 'parseError')) {
    input.parseError = normalizeNullableText(body.parseError, 'parseError');
  }

  if (hasOwnField(body, 'notes')) {
    input.notes = normalizeNullableText(body.notes, 'notes');
  }

  return input;
}

export function parseUpdateReceiptInput(body: unknown): UpdateReceiptInput {
  if (!isRecord(body)) {
    throw new ReceiptInputError('Request body must be an object');
  }

  const input: UpdateReceiptInput = {};

  if (hasOwnField(body, 'purchaseAt')) {
    input.purchaseAt = normalizeNullableDate(body.purchaseAt, 'purchaseAt');
  }

  if (hasOwnField(body, 'totalAmount')) {
    input.totalAmount = normalizeNonNegativeNumber(body.totalAmount, 'totalAmount');
  }

  if (hasOwnField(body, 'currency')) {
    input.currency = normalizeCurrency(body.currency);
  }

  if (hasOwnField(body, 'status')) {
    input.status = normalizeOptionalStatus(body.status);
  }

  if (hasOwnField(body, 'storeId')) {
    input.storeId = normalizeNullableText(body.storeId, 'storeId');
  }

  if (hasOwnField(body, 'storeName')) {
    input.storeName = normalizeNullableText(body.storeName, 'storeName');
  }

  if (hasOwnField(body, 'imageStorageKey')) {
    input.imageStorageKey = normalizeNullableText(body.imageStorageKey, 'imageStorageKey');
  }

  if (hasOwnField(body, 'thumbnailStorageKey')) {
    input.thumbnailStorageKey = normalizeNullableText(body.thumbnailStorageKey, 'thumbnailStorageKey');
  }

  if (hasOwnField(body, 'rawOcrText')) {
    input.rawOcrText = normalizeNullableText(body.rawOcrText, 'rawOcrText');
  }

  if (hasOwnField(body, 'parserVersion')) {
    input.parserVersion = normalizeNullableText(body.parserVersion, 'parserVersion');
  }

  if (hasOwnField(body, 'parseError')) {
    input.parseError = normalizeNullableText(body.parseError, 'parseError');
  }

  if (hasOwnField(body, 'notes')) {
    input.notes = normalizeNullableText(body.notes, 'notes');
  }

  if (Object.keys(input).length === 0) {
    throw new ReceiptInputError('At least one mutable receipt field is required');
  }

  return input;
}

function parseReceiptItemRecord(
  body: unknown,
  options: { partial: boolean }
): CreateReceiptItemInput | UpdateReceiptItemInput {
  if (!isRecord(body)) {
    throw new ReceiptInputError('Receipt item payload must be an object');
  }

  const input: CreateReceiptItemInput | UpdateReceiptItemInput = {};

  if (hasOwnField(body, 'rawName')) {
    const rawName = normalizeNullableText(body.rawName, 'rawName');
    if (!rawName) {
      throw new ReceiptInputError('rawName is required');
    }
    input.rawName = rawName;
  } else if (!options.partial) {
    throw new ReceiptInputError('rawName is required');
  }

  if (hasOwnField(body, 'normalizedName')) {
    input.normalizedName = normalizeNullableText(body.normalizedName, 'normalizedName');
  }

  if (hasOwnField(body, 'brand')) {
    input.brand = normalizeNullableText(body.brand, 'brand');
  }

  if (hasOwnField(body, 'quantity')) {
    input.quantity = normalizeNonNegativeNumber(body.quantity, 'quantity');
  }

  if (hasOwnField(body, 'unit')) {
    input.unit = normalizeNullableText(body.unit, 'unit');
  }

  if (hasOwnField(body, 'unitPrice')) {
    input.unitPrice = normalizeNonNegativeNumber(body.unitPrice, 'unitPrice');
  }

  if (hasOwnField(body, 'linePrice')) {
    input.linePrice = normalizeNonNegativeNumber(body.linePrice, 'linePrice');
  }

  if (hasOwnField(body, 'discountAmount')) {
    input.discountAmount = normalizeNonNegativeNumber(body.discountAmount, 'discountAmount');
  }

  if (hasOwnField(body, 'confidenceScore')) {
    input.confidenceScore = normalizeConfidenceScore(body.confidenceScore, 'confidenceScore');
  }

  if (hasOwnField(body, 'reviewStatus')) {
    input.reviewStatus = normalizeOptionalReviewStatus(body.reviewStatus);
  }

  if (hasOwnField(body, 'productId')) {
    input.productId = normalizeNullableText(body.productId, 'productId');
  }

  if (options.partial && Object.keys(input).length === 0) {
    throw new ReceiptInputError('At least one mutable receipt item field is required');
  }

  return input;
}

export function parseCreateReceiptItemsInput(body: unknown): CreateReceiptItemInput[] {
  let rawItems: unknown;

  if (Array.isArray(body)) {
    rawItems = body;
  } else if (isRecord(body) && Array.isArray(body.items)) {
    rawItems = body.items;
  } else {
    throw new ReceiptInputError('items must be an array');
  }

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new ReceiptInputError('At least one receipt item is required');
  }

  return rawItems.map(item => parseReceiptItemRecord(item, { partial: false }) as CreateReceiptItemInput);
}

export function parseUpdateReceiptItemInput(body: unknown): UpdateReceiptItemInput {
  return parseReceiptItemRecord(body, { partial: true }) as UpdateReceiptItemInput;
}

export function parseReceiptProcessInput(body: unknown): ReceiptProcessInput {
  const input = parseUpdateReceiptInput(body);

  if (Object.prototype.hasOwnProperty.call(input, 'status')) {
    return input;
  }

  return {
    ...input,
    status: input.parseError ? 'FAILED' : 'NEEDS_REVIEW',
  };
}

export async function listReceipts(options: ListReceiptsOptions = {}) {
  return runReceiptQuery(async () => {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);
    const whereClauses: Prisma.Sql[] = [];

    if (options.statuses && options.statuses.length > 0) {
      const statusFilters = options.statuses.map(
        status => Prisma.sql`${status}::"ReceiptStatus"`
      );
      whereClauses.push(Prisma.sql`r.status IN (${Prisma.join(statusFilters, ', ')})`);
    }

    const whereSql = whereClauses.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(whereClauses, ' AND ')}`
      : Prisma.empty;

    const groupOrderSql = Prisma.sql`
      GROUP BY
        r.id,
        s.id,
        s.name,
        s.chain,
        s."branchName",
        s."branchAddress"
      ORDER BY r."capturedAt" DESC, r."createdAt" DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const [rows, totalRows] = await Promise.all([
      prisma.$queryRaw<ReceiptRow[]>(Prisma.sql`${RECEIPT_SELECT} ${whereSql} ${groupOrderSql}`),
      prisma.$queryRaw<{ total: number | bigint }[]>(Prisma.sql`
        SELECT COUNT(*)::int AS total
        FROM "Receipt" r
        ${whereSql}
      `),
    ]);

    return {
      receipts: rows.map(mapReceiptRow),
      total: Number(totalRows[0]?.total ?? 0),
      limit,
      offset,
    };
  });
}

export async function receiptExists(id: string) {
  return runReceiptQuery(async () => {
    const rows = await prisma.$queryRaw<{ exists: number }[]>(Prisma.sql`
      SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM "Receipt"
        WHERE id = ${id}
      ) THEN 1 ELSE 0 END::int AS exists
    `);

    return Number(rows[0]?.exists ?? 0) === 1;
  });
}

async function assertProductExists(productId: string | null | undefined) {
  if (!productId) return;

  const rows = await prisma.$queryRaw<{ exists: number }[]>(Prisma.sql`
    SELECT CASE WHEN EXISTS (
      SELECT 1
      FROM "Product"
      WHERE id = ${productId}
    ) THEN 1 ELSE 0 END::int AS exists
  `);

  if (Number(rows[0]?.exists ?? 0) !== 1) {
    throw new ReceiptInputError('Product not found');
  }
}

export async function listReceiptItems(receiptId: string) {
  return runReceiptQuery(async () => {
    const exists = await receiptExists(receiptId);
    if (!exists) {
      return null;
    }

    const itemRows = await prisma.$queryRaw<ReceiptItemRow[]>(Prisma.sql`
      SELECT
        i.id,
        i."productId",
        p."canonicalName" AS "productCanonicalName",
        i."rawName",
        i."normalizedName",
        i.brand,
        i.quantity,
        i.unit,
        i."unitPrice",
        i."linePrice",
        i."discountAmount",
        i."confidenceScore",
        i."reviewStatus"::text AS "reviewStatus",
        i."createdAt",
        i."updatedAt"
      FROM "ReceiptItem" i
      LEFT JOIN "Product" p ON p.id = i."productId"
      WHERE i."receiptId" = ${receiptId}
      ORDER BY i."createdAt" ASC, i.id ASC
    `);

    return itemRows.map(mapReceiptItemRow);
  });
}

export async function getReceiptById(id: string) {
  return runReceiptQuery(async () => {
    const rows = await prisma.$queryRaw<ReceiptRow[]>(Prisma.sql`
      ${RECEIPT_SELECT}
      WHERE r.id = ${id}
      GROUP BY
        r.id,
        s.id,
        s.name,
        s.chain,
        s."branchName",
        s."branchAddress"
      LIMIT 1
    `);

    const receiptRow = rows[0];
    if (!receiptRow) {
      return null;
    }

    return {
      ...mapReceiptRow(receiptRow),
      parserVersion: receiptRow.parserVersion,
      parseError: receiptRow.parseError,
      rawOcrText: receiptRow.rawOcrText,
      store: receiptRow.storeId
        ? {
            id: receiptRow.storeId,
            name: receiptRow.storeName ?? 'חנות לא ידועה',
            chain: receiptRow.storeChain,
            branchName: receiptRow.storeBranchName,
            branchAddress: receiptRow.storeBranchAddress,
          }
        : null,
      items: (await listReceiptItems(id)) ?? [],
    } satisfies ReceiptDetail;
  });
}

export async function createReceipt(input: CreateReceiptInput) {
  return runReceiptQuery(async () => {
    const id = randomUUID();
    const storeId = await resolveStoreId({
      storeId: input.storeId,
      storeName: input.storeName,
    });

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "Receipt" (
        "id",
        "storeId",
        "capturedAt",
        "purchaseAt",
        "totalAmount",
        "currency",
        "status",
        "imageStorageKey",
        "thumbnailStorageKey",
        "rawOcrText",
        "parserVersion",
        "parseError",
        "notes",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${id},
        ${storeId},
        ${input.capturedAt ?? new Date()},
        ${input.purchaseAt ?? null},
        ${input.totalAmount ?? null},
        ${input.currency ?? 'ILS'},
        ${(input.status ?? 'PENDING_UPLOAD')}::"ReceiptStatus",
        ${input.imageStorageKey ?? null},
        ${input.thumbnailStorageKey ?? null},
        ${input.rawOcrText ?? null},
        ${input.parserVersion ?? null},
        ${input.parseError ?? null},
        ${input.notes ?? null},
        NOW(),
        NOW()
      )
    `);

    return getReceiptById(id);
  });
}

export async function createReceiptItems(
  receiptId: string,
  items: CreateReceiptItemInput[]
) {
  return runReceiptQuery(async () => {
    const exists = await receiptExists(receiptId);
    if (!exists) {
      return null;
    }

    const createdIds: string[] = [];

    for (const item of items) {
      await assertProductExists(item.productId);

      const id = randomUUID();
      createdIds.push(id);

      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO "ReceiptItem" (
          "id",
          "receiptId",
          "productId",
          "rawName",
          "normalizedName",
          "brand",
          "quantity",
          "unit",
          "unitPrice",
          "linePrice",
          "discountAmount",
          "confidenceScore",
          "reviewStatus",
          "createdAt",
          "updatedAt"
        ) VALUES (
          ${id},
          ${receiptId},
          ${item.productId ?? null},
          ${item.rawName},
          ${item.normalizedName ?? null},
          ${item.brand ?? null},
          ${item.quantity ?? null},
          ${item.unit ?? null},
          ${item.unitPrice ?? null},
          ${item.linePrice ?? null},
          ${item.discountAmount ?? null},
          ${item.confidenceScore ?? null},
          ${(item.reviewStatus ?? 'UNREVIEWED')}::"ReceiptItemReviewStatus",
          NOW(),
          NOW()
        )
      `);
    }

    const createdRows = await prisma.$queryRaw<ReceiptItemRow[]>(Prisma.sql`
      SELECT
        i.id,
        i."productId",
        p."canonicalName" AS "productCanonicalName",
        i."rawName",
        i."normalizedName",
        i.brand,
        i.quantity,
        i.unit,
        i."unitPrice",
        i."linePrice",
        i."discountAmount",
        i."confidenceScore",
        i."reviewStatus"::text AS "reviewStatus",
        i."createdAt",
        i."updatedAt"
      FROM "ReceiptItem" i
      LEFT JOIN "Product" p ON p.id = i."productId"
      WHERE i.id IN (${Prisma.join(createdIds, ', ')})
      ORDER BY i."createdAt" ASC, i.id ASC
    `);

    return createdRows.map(mapReceiptItemRow);
  });
}

export async function updateReceipt(id: string, input: UpdateReceiptInput) {
  return runReceiptQuery(async () => {
    const assignments: Prisma.Sql[] = [];

    if (Object.prototype.hasOwnProperty.call(input, 'purchaseAt')) {
      assignments.push(Prisma.sql`"purchaseAt" = ${input.purchaseAt ?? null}`);
    }

    if (Object.prototype.hasOwnProperty.call(input, 'totalAmount')) {
      assignments.push(Prisma.sql`"totalAmount" = ${input.totalAmount ?? null}`);
    }

    if (Object.prototype.hasOwnProperty.call(input, 'currency')) {
      assignments.push(Prisma.sql`currency = ${input.currency ?? 'ILS'}`);
    }

    if (Object.prototype.hasOwnProperty.call(input, 'status')) {
      assignments.push(Prisma.sql`status = ${input.status}::"ReceiptStatus"`);
    }

    if (
      Object.prototype.hasOwnProperty.call(input, 'storeId')
      || Object.prototype.hasOwnProperty.call(input, 'storeName')
    ) {
      const storeId = await resolveStoreId({
        storeId: input.storeId,
        storeName: input.storeName,
      });
      assignments.push(Prisma.sql`"storeId" = ${storeId}`);
    }

    if (Object.prototype.hasOwnProperty.call(input, 'imageStorageKey')) {
      assignments.push(Prisma.sql`"imageStorageKey" = ${input.imageStorageKey ?? null}`);
    }

    if (Object.prototype.hasOwnProperty.call(input, 'thumbnailStorageKey')) {
      assignments.push(Prisma.sql`"thumbnailStorageKey" = ${input.thumbnailStorageKey ?? null}`);
    }

    if (Object.prototype.hasOwnProperty.call(input, 'rawOcrText')) {
      assignments.push(Prisma.sql`"rawOcrText" = ${input.rawOcrText ?? null}`);
    }

    if (Object.prototype.hasOwnProperty.call(input, 'parserVersion')) {
      assignments.push(Prisma.sql`"parserVersion" = ${input.parserVersion ?? null}`);
    }

    if (Object.prototype.hasOwnProperty.call(input, 'parseError')) {
      assignments.push(Prisma.sql`"parseError" = ${input.parseError ?? null}`);
    }

    if (Object.prototype.hasOwnProperty.call(input, 'notes')) {
      assignments.push(Prisma.sql`notes = ${input.notes ?? null}`);
    }

    if (assignments.length === 0) {
      throw new ReceiptInputError('At least one mutable receipt field is required');
    }

    assignments.push(Prisma.sql`"updatedAt" = NOW()`);

    const updatedCount = await prisma.$executeRaw(Prisma.sql`
      UPDATE "Receipt"
      SET ${Prisma.join(assignments, ', ')}
      WHERE id = ${id}
    `);

    if (updatedCount === 0) {
      return null;
    }

    return getReceiptById(id);
  });
}

export async function updateReceiptItem(
  receiptId: string,
  itemId: string,
  input: UpdateReceiptItemInput
) {
  return runReceiptQuery(async () => {
    const exists = await receiptExists(receiptId);
    if (!exists) {
      return null;
    }

    const assignments: Prisma.Sql[] = [];

    if (Object.prototype.hasOwnProperty.call(input, 'rawName')) {
      assignments.push(Prisma.sql`"rawName" = ${input.rawName}`);
    }

    if (Object.prototype.hasOwnProperty.call(input, 'normalizedName')) {
      assignments.push(Prisma.sql`"normalizedName" = ${input.normalizedName ?? null}`);
    }

    if (Object.prototype.hasOwnProperty.call(input, 'brand')) {
      assignments.push(Prisma.sql`brand = ${input.brand ?? null}`);
    }

    if (Object.prototype.hasOwnProperty.call(input, 'quantity')) {
      assignments.push(Prisma.sql`quantity = ${input.quantity ?? null}`);
    }

    if (Object.prototype.hasOwnProperty.call(input, 'unit')) {
      assignments.push(Prisma.sql`unit = ${input.unit ?? null}`);
    }

    if (Object.prototype.hasOwnProperty.call(input, 'unitPrice')) {
      assignments.push(Prisma.sql`"unitPrice" = ${input.unitPrice ?? null}`);
    }

    if (Object.prototype.hasOwnProperty.call(input, 'linePrice')) {
      assignments.push(Prisma.sql`"linePrice" = ${input.linePrice ?? null}`);
    }

    if (Object.prototype.hasOwnProperty.call(input, 'discountAmount')) {
      assignments.push(Prisma.sql`"discountAmount" = ${input.discountAmount ?? null}`);
    }

    if (Object.prototype.hasOwnProperty.call(input, 'confidenceScore')) {
      assignments.push(Prisma.sql`"confidenceScore" = ${input.confidenceScore ?? null}`);
    }

    if (Object.prototype.hasOwnProperty.call(input, 'reviewStatus')) {
      assignments.push(
        Prisma.sql`"reviewStatus" = ${input.reviewStatus}::"ReceiptItemReviewStatus"`
      );
    }

    if (Object.prototype.hasOwnProperty.call(input, 'productId')) {
      await assertProductExists(input.productId);
      assignments.push(Prisma.sql`"productId" = ${input.productId ?? null}`);
    }

    if (assignments.length === 0) {
      throw new ReceiptInputError('At least one mutable receipt item field is required');
    }

    assignments.push(Prisma.sql`"updatedAt" = NOW()`);

    const updatedCount = await prisma.$executeRaw(Prisma.sql`
      UPDATE "ReceiptItem"
      SET ${Prisma.join(assignments, ', ')}
      WHERE id = ${itemId}
        AND "receiptId" = ${receiptId}
    `);

    if (updatedCount === 0) {
      return false;
    }

    const updatedRows = await prisma.$queryRaw<ReceiptItemRow[]>(Prisma.sql`
      SELECT
        i.id,
        i."productId",
        p."canonicalName" AS "productCanonicalName",
        i."rawName",
        i."normalizedName",
        i.brand,
        i.quantity,
        i.unit,
        i."unitPrice",
        i."linePrice",
        i."discountAmount",
        i."confidenceScore",
        i."reviewStatus"::text AS "reviewStatus",
        i."createdAt",
        i."updatedAt"
      FROM "ReceiptItem" i
      LEFT JOIN "Product" p ON p.id = i."productId"
      WHERE i.id = ${itemId}
        AND i."receiptId" = ${receiptId}
      LIMIT 1
    `);

    return updatedRows[0] ? mapReceiptItemRow(updatedRows[0]) : false;
  });
}

export async function processReceipt(
  receiptId: string,
  input: ReceiptProcessInput
) {
  return updateReceipt(receiptId, {
    ...input,
    status: input.status ?? (input.parseError ? 'FAILED' : 'NEEDS_REVIEW'),
  });
}

export async function completeReceiptReview(receiptId: string) {
  return runReceiptQuery(async () => {
    const exists = await receiptExists(receiptId);
    if (!exists) {
      return null;
    }

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "ReceiptItem"
      SET
        "reviewStatus" = 'CONFIRMED'::"ReceiptItemReviewStatus",
        "updatedAt" = NOW()
      WHERE "receiptId" = ${receiptId}
        AND "reviewStatus" = 'UNREVIEWED'::"ReceiptItemReviewStatus"
    `);

    return updateReceipt(receiptId, {
      status: 'COMPLETED',
      parseError: null,
    });
  });
}
