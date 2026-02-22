import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  clampRecurringSuggestionSnoozeDays,
  normalizeRecurringSuggestionSnoozes,
  parseRecurringSuggestionKey,
  RECURRING_SNOOZE_SETTING_KEY,
  type SnoozedSuggestionMap,
} from '@/lib/recurring-suggestion-snooze';

async function readSnoozedMap() {
  const setting = await prisma.setting.findUnique({
    where: { key: RECURRING_SNOOZE_SETTING_KEY },
  });

  const normalized = normalizeRecurringSuggestionSnoozes(setting?.value);
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
    const suggestionKey = parseRecurringSuggestionKey(suggestionKeyRaw);

    if (!suggestionKey) {
      return NextResponse.json({ error: 'Invalid suggestion key' }, { status: 400 });
    }

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

    const snoozeDays = clampRecurringSuggestionSnoozeDays((body as { snoozeDays?: unknown }).snoozeDays);
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
