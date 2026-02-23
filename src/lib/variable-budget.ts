import dayjs from 'dayjs';
import { prisma } from '@/lib/prisma';
import { getPeriodKey, PeriodMode } from '@/lib/period-utils';

export const VARIABLE_BUDGET_SETTING_KEY = 'variable_budget_plans_v1';
const MAX_PLAN_COUNT = 36;
const MAX_PLAN_ITEM_COUNT = 200;
const MAX_CATEGORY_ID_LENGTH = 100;
const MAX_AMOUNT = 1_000_000;
const PERIOD_KEY_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

interface VariableBudgetPlanRecord {
  updatedAt: string;
  items: Record<string, number>;
}

interface VariableBudgetStore {
  plans: Record<string, VariableBudgetPlanRecord>;
}

export interface VariableBudgetPlan {
  periodMode: PeriodMode;
  periodKey: string;
  updatedAt: string;
  items: Record<string, number>;
}

function normalizeCategoryId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_CATEGORY_ID_LENGTH) return null;
  return trimmed;
}

function normalizeAmount(value: unknown): number | null {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) return null;
  if (amount <= 0) return null;
  if (amount > MAX_AMOUNT) return MAX_AMOUNT;
  return Number(amount.toFixed(2));
}

export function parseBudgetPeriodKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!PERIOD_KEY_REGEX.test(trimmed)) return null;
  return trimmed;
}

export function getCurrentPeriodKey(mode: PeriodMode): string {
  return getPeriodKey(dayjs(), mode);
}

export function makeBudgetPlanStorageKey(periodMode: PeriodMode, periodKey: string): string {
  return `${periodMode}:${periodKey}`;
}

function normalizePlanRecord(value: unknown): VariableBudgetPlanRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const rawUpdatedAt = (value as { updatedAt?: unknown }).updatedAt;
  const rawItems = (value as { items?: unknown }).items;
  if (!rawItems || typeof rawItems !== 'object' || Array.isArray(rawItems)) return null;

  const normalizedItems: Record<string, number> = {};
  for (const [rawCategoryId, rawAmount] of Object.entries(rawItems as Record<string, unknown>)) {
    const categoryId = normalizeCategoryId(rawCategoryId);
    const amount = normalizeAmount(rawAmount);
    if (!categoryId || amount === null) continue;
    normalizedItems[categoryId] = amount;
    if (Object.keys(normalizedItems).length >= MAX_PLAN_ITEM_COUNT) break;
  }

  const updatedAtMs = typeof rawUpdatedAt === 'string' ? Date.parse(rawUpdatedAt) : NaN;
  const updatedAt = Number.isFinite(updatedAtMs)
    ? new Date(updatedAtMs).toISOString()
    : new Date().toISOString();

  return {
    updatedAt,
    items: normalizedItems,
  };
}

export function normalizeVariableBudgetStore(value: string | null | undefined): VariableBudgetStore {
  if (!value) return { plans: {} };

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { plans: {} };

    const rawPlans = (parsed as { plans?: unknown }).plans;
    if (!rawPlans || typeof rawPlans !== 'object' || Array.isArray(rawPlans)) return { plans: {} };

    const normalizedPlans: Record<string, VariableBudgetPlanRecord> = {};
    const sortedEntries = Object.entries(rawPlans as Record<string, unknown>)
      .map(([storageKey, record]) => {
        const [mode, periodKey] = storageKey.split(':');
        if ((mode !== 'calendar' && mode !== 'billing') || !parseBudgetPeriodKey(periodKey)) return null;
        const normalizedRecord = normalizePlanRecord(record);
        if (!normalizedRecord) return null;
        return [storageKey, normalizedRecord] as const;
      })
      .filter((entry): entry is readonly [string, VariableBudgetPlanRecord] => entry !== null)
      .sort((a, b) => Date.parse(b[1].updatedAt) - Date.parse(a[1].updatedAt))
      .slice(0, MAX_PLAN_COUNT);

    for (const [storageKey, record] of sortedEntries) {
      normalizedPlans[storageKey] = record;
    }

    return { plans: normalizedPlans };
  } catch {
    return { plans: {} };
  }
}

export async function getVariableBudgetStore(): Promise<VariableBudgetStore> {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: VARIABLE_BUDGET_SETTING_KEY },
      select: { value: true },
    });
    return normalizeVariableBudgetStore(setting?.value);
  } catch {
    return { plans: {} };
  }
}

export async function getVariableBudgetPlan(
  periodMode: PeriodMode,
  periodKey: string
): Promise<VariableBudgetPlan> {
  const parsedPeriodKey = parseBudgetPeriodKey(periodKey) || getCurrentPeriodKey(periodMode);
  const store = await getVariableBudgetStore();
  const storageKey = makeBudgetPlanStorageKey(periodMode, parsedPeriodKey);
  const record = store.plans[storageKey];

  return {
    periodMode,
    periodKey: parsedPeriodKey,
    updatedAt: record?.updatedAt || '',
    items: record?.items || {},
  };
}

export async function getVariableBudgetPlansByKeys(
  periodMode: PeriodMode,
  periodKeys: string[]
): Promise<Record<string, VariableBudgetPlan>> {
  const store = await getVariableBudgetStore();
  const uniquePeriodKeys = Array.from(
    new Set(
      periodKeys
        .map((periodKey) => parseBudgetPeriodKey(periodKey))
        .filter((periodKey): periodKey is string => Boolean(periodKey))
    )
  );

  const result: Record<string, VariableBudgetPlan> = {};
  for (const periodKey of uniquePeriodKeys) {
    const storageKey = makeBudgetPlanStorageKey(periodMode, periodKey);
    const record = store.plans[storageKey];
    result[periodKey] = {
      periodMode,
      periodKey,
      updatedAt: record?.updatedAt || '',
      items: record?.items || {},
    };
  }

  return result;
}

export async function saveVariableBudgetPlan(
  periodMode: PeriodMode,
  periodKey: string,
  items: Record<string, number>
): Promise<VariableBudgetPlan> {
  const parsedPeriodKey = parseBudgetPeriodKey(periodKey);
  if (!parsedPeriodKey) {
    throw new Error('Invalid period key');
  }

  const normalizedItems: Record<string, number> = {};
  for (const [rawCategoryId, rawAmount] of Object.entries(items)) {
    const categoryId = normalizeCategoryId(rawCategoryId);
    const amount = normalizeAmount(rawAmount);
    if (!categoryId || amount === null) continue;
    normalizedItems[categoryId] = amount;
    if (Object.keys(normalizedItems).length >= MAX_PLAN_ITEM_COUNT) break;
  }

  const store = await getVariableBudgetStore();
  const storageKey = makeBudgetPlanStorageKey(periodMode, parsedPeriodKey);
  const updatedAt = new Date().toISOString();
  store.plans[storageKey] = {
    updatedAt,
    items: normalizedItems,
  };

  const limitedPlans = Object.entries(store.plans)
    .sort((a, b) => Date.parse(b[1].updatedAt) - Date.parse(a[1].updatedAt))
    .slice(0, MAX_PLAN_COUNT);
  const compactPlans = Object.fromEntries(limitedPlans);

  await prisma.setting.upsert({
    where: { key: VARIABLE_BUDGET_SETTING_KEY },
    update: {
      value: JSON.stringify({ plans: compactPlans }),
    },
    create: {
      key: VARIABLE_BUDGET_SETTING_KEY,
      value: JSON.stringify({ plans: compactPlans }),
    },
  });

  return {
    periodMode,
    periodKey: parsedPeriodKey,
    updatedAt,
    items: normalizedItems,
  };
}
