import { prisma } from '@/lib/prisma';

export const RECURRING_SNOOZE_SETTING_KEY = 'recurring_suggestion_snoozes_v1';
const DEFAULT_SNOOZE_DAYS = 30;
const MIN_SNOOZE_DAYS = 1;
const MAX_SNOOZE_DAYS = 365;
const MIN_KEY_LENGTH = 3;
const MAX_KEY_LENGTH = 200;

export type SnoozedSuggestionMap = Record<string, string>;

export function normalizeRecurringSuggestionSnoozes(
  value: string | null | undefined,
  nowMs: number = Date.now()
): SnoozedSuggestionMap {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const normalized: SnoozedSuggestionMap = {};

    for (const [key, expiresAt] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof key !== 'string' || typeof expiresAt !== 'string') continue;
      if (key.length < MIN_KEY_LENGTH || key.length > MAX_KEY_LENGTH) continue;

      const expiresMs = Date.parse(expiresAt);
      if (!Number.isFinite(expiresMs)) continue;
      if (expiresMs <= nowMs) continue;

      normalized[key] = new Date(expiresMs).toISOString();
    }

    return normalized;
  } catch {
    return {};
  }
}

export function parseRecurringSuggestionKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length < MIN_KEY_LENGTH || trimmed.length > MAX_KEY_LENGTH) return null;
  return trimmed;
}

export function clampRecurringSuggestionSnoozeDays(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SNOOZE_DAYS;
  return Math.min(MAX_SNOOZE_DAYS, Math.max(MIN_SNOOZE_DAYS, Math.round(parsed)));
}

export async function getRecurringSuggestionSnoozes(): Promise<SnoozedSuggestionMap> {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: RECURRING_SNOOZE_SETTING_KEY },
    });
    return normalizeRecurringSuggestionSnoozes(setting?.value);
  } catch {
    return {};
  }
}

