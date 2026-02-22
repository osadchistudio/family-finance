import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const RECURRING_SNOOZE_SETTING_KEY = 'recurring_suggestion_snoozes_v1';
const DEFAULT_SNOOZE_DAYS = 30;
const MIN_SNOOZE_DAYS = 1;
const MAX_SNOOZE_DAYS = 365;

type SnoozedSuggestionMap = Record<string, string>;

function normalizeSnoozedSuggestions(value: string | null | undefined): SnoozedSuggestionMap {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const nowMs = Date.now();
    const normalized: SnoozedSuggestionMap = {};

    for (const [key, expiresAt] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof key !== 'string' || typeof expiresAt !== 'string') continue;
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

function clampSnoozeDays(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SNOOZE_DAYS;
  return Math.min(MAX_SNOOZE_DAYS, Math.max(MIN_SNOOZE_DAYS, Math.round(parsed)));
}

function isValidSuggestionKey(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 3 && value.trim().length <= 200;
}

async function readSnoozedMap() {
  const setting = await prisma.setting.findUnique({
    where: { key: RECURRING_SNOOZE_SETTING_KEY },
  });

  const normalized = normalizeSnoozedSuggestions(setting?.value);
  return {
    setting,
    normalized,
  };
}

async function persistSnoozedMap(map: SnoozedSuggestionMap) {
  await prisma.setting.upsert({
    where: { key: RECURRING_SNOOZE_SETTING_KEY },
    create: {
      key: RECURRING_SNOOZE_SETTING_KEY,
      value: JSON.stringify(map),
    },
    update: {
      value: JSON.stringify(map),
    },
  });
}

export async function GET() {
  try {
    const { setting, normalized } = await readSnoozedMap();

    // Keep stored payload clean from expired/invalid records.
    const normalizedValue = JSON.stringify(normalized);
    if (setting?.value !== normalizedValue) {
      await persistSnoozedMap(normalized);
    }

    return NextResponse.json({
      snoozed: normalized,
    });
  } catch (error) {
    console.error('Get recurring suggestion snoozes error:', error);
    return NextResponse.json(
      { error: 'Failed to load recurring suggestion snoozes' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const suggestionKeyRaw = (body as { suggestionKey?: unknown }).suggestionKey;
    const actionRaw = (body as { action?: unknown }).action;

    if (!isValidSuggestionKey(suggestionKeyRaw)) {
      return NextResponse.json({ error: 'Invalid suggestion key' }, { status: 400 });
    }

    const suggestionKey = suggestionKeyRaw.trim();
    const action = actionRaw === 'clear' ? 'clear' : 'snooze';
    const { normalized } = await readSnoozedMap();

    if (action === 'clear') {
      delete normalized[suggestionKey];
      await persistSnoozedMap(normalized);
      return NextResponse.json({
        success: true,
        suggestionKey,
        action,
        expiresAt: null,
        snoozed: normalized,
      });
    }

    const snoozeDays = clampSnoozeDays((body as { snoozeDays?: unknown }).snoozeDays);
    const expiresAt = new Date(Date.now() + snoozeDays * 24 * 60 * 60 * 1000).toISOString();
    normalized[suggestionKey] = expiresAt;

    await persistSnoozedMap(normalized);

    return NextResponse.json({
      success: true,
      suggestionKey,
      action,
      snoozeDays,
      expiresAt,
      snoozed: normalized,
    });
  } catch (error) {
    console.error('Update recurring suggestion snooze error:', error);
    return NextResponse.json(
      { error: 'Failed to update recurring suggestion snooze' },
      { status: 500 }
    );
  }
}
