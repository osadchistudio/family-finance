import { prisma } from '@/lib/prisma';

export const SMART_NUDGE_SNOOZE_SETTING_KEY = 'smart_nudge_snoozes_v1';
export const SMART_NUDGE_DISMISSED_SETTING_KEY = 'smart_nudge_dismissed_v1';
const DEFAULT_SNOOZE_DAYS = 7;
const MIN_SNOOZE_DAYS = 1;
const MAX_SNOOZE_DAYS = 90;
const DISMISS_RETENTION_DAYS = 180;
const MIN_KEY_LENGTH = 3;
const MAX_KEY_LENGTH = 240;

export type SnoozedSmartNudgeMap = Record<string, string>;
export type DismissedSmartNudgeMap = Record<string, string>;

export function buildSmartNudgeSnoozeKey(periodKey: string, nudgeKey: string): string {
  return `${periodKey}:${nudgeKey}`;
}

function normalizeStoredSmartNudgeMap(
  value: string | null | undefined,
  nowMs: number = Date.now(),
  maxAgeMs?: number
): Record<string, string> {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const normalized: Record<string, string> = {};

    for (const [key, storedAt] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof key !== 'string' || typeof storedAt !== 'string') continue;
      if (key.length < MIN_KEY_LENGTH || key.length > MAX_KEY_LENGTH) continue;

      const storedMs = Date.parse(storedAt);
      if (!Number.isFinite(storedMs)) continue;

      if (typeof maxAgeMs === 'number') {
        if (storedMs + maxAgeMs <= nowMs) continue;
      } else if (storedMs <= nowMs) {
        continue;
      }

      normalized[key] = new Date(storedMs).toISOString();
    }

    return normalized;
  } catch {
    return {};
  }
}

export function normalizeSmartNudgeSnoozes(
  value: string | null | undefined,
  nowMs: number = Date.now()
): SnoozedSmartNudgeMap {
  return normalizeStoredSmartNudgeMap(value, nowMs);
}

export function normalizeSmartNudgeDismissals(
  value: string | null | undefined,
  nowMs: number = Date.now()
): DismissedSmartNudgeMap {
  return normalizeStoredSmartNudgeMap(value, nowMs, DISMISS_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export function parseSmartNudgeKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length < MIN_KEY_LENGTH || trimmed.length > MAX_KEY_LENGTH) return null;
  return trimmed;
}

export function clampSmartNudgeSnoozeDays(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SNOOZE_DAYS;
  return Math.min(MAX_SNOOZE_DAYS, Math.max(MIN_SNOOZE_DAYS, Math.round(parsed)));
}

export async function getSmartNudgeSnoozes(): Promise<SnoozedSmartNudgeMap> {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: SMART_NUDGE_SNOOZE_SETTING_KEY },
    });

    return normalizeSmartNudgeSnoozes(setting?.value);
  } catch {
    return {};
  }
}

export async function getSmartNudgeDismissals(): Promise<DismissedSmartNudgeMap> {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: SMART_NUDGE_DISMISSED_SETTING_KEY },
    });

    return normalizeSmartNudgeDismissals(setting?.value);
  } catch {
    return {};
  }
}
