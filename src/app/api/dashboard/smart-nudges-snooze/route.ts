import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  clampSmartNudgeSnoozeDays,
  normalizeSmartNudgeDismissals,
  normalizeSmartNudgeSnoozes,
  parseSmartNudgeKey,
  SMART_NUDGE_DISMISSED_SETTING_KEY,
  SMART_NUDGE_SNOOZE_SETTING_KEY,
  type DismissedSmartNudgeMap,
  type SnoozedSmartNudgeMap,
} from '@/lib/smart-nudge-snooze';

type SmartNudgeMap = SnoozedSmartNudgeMap | DismissedSmartNudgeMap;

async function readStoredMap(
  key: string,
  normalize: (value: string | null | undefined) => SmartNudgeMap
) {
  const setting = await prisma.setting.findUnique({
    where: { key },
  });

  const normalized = normalize(setting?.value);
  return {
    setting,
    normalized,
  };
}

async function readSnoozedMap() {
  return readStoredMap(SMART_NUDGE_SNOOZE_SETTING_KEY, normalizeSmartNudgeSnoozes);
}

async function readDismissedMap() {
  return readStoredMap(SMART_NUDGE_DISMISSED_SETTING_KEY, normalizeSmartNudgeDismissals);
}

async function persistStoredMap(key: string, map: SmartNudgeMap) {
  await prisma.setting.upsert({
    where: { key },
    create: {
      key,
      value: JSON.stringify(map),
    },
    update: {
      value: JSON.stringify(map),
    },
  });
}

async function persistSnoozedMap(map: SnoozedSmartNudgeMap) {
  await persistStoredMap(SMART_NUDGE_SNOOZE_SETTING_KEY, map);
}

async function persistDismissedMap(map: DismissedSmartNudgeMap) {
  await persistStoredMap(SMART_NUDGE_DISMISSED_SETTING_KEY, map);
}

export async function GET() {
  try {
    const [
      { setting: snoozeSetting, normalized: snoozed },
      { setting: dismissedSetting, normalized: dismissed },
    ] = await Promise.all([readSnoozedMap(), readDismissedMap()]);

    const normalizedSnoozedValue = JSON.stringify(snoozed);
    if (snoozeSetting?.value !== normalizedSnoozedValue) {
      await persistSnoozedMap(snoozed);
    }

    const normalizedDismissedValue = JSON.stringify(dismissed);
    if (dismissedSetting?.value !== normalizedDismissedValue) {
      await persistDismissedMap(dismissed);
    }

    return NextResponse.json({
      snoozed,
      dismissed,
    });
  } catch (error) {
    console.error('Get smart nudge states error:', error);
    return NextResponse.json(
      { error: 'Failed to load smart nudge states' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const nudgeKeyRaw = (body as { nudgeKey?: unknown }).nudgeKey;
    const actionRaw = (body as { action?: unknown }).action;
    const nudgeKey = parseSmartNudgeKey(nudgeKeyRaw);

    if (!nudgeKey) {
      return NextResponse.json({ error: 'Invalid nudge key' }, { status: 400 });
    }

    const action =
      actionRaw === 'clear' || actionRaw === 'dismiss' ? actionRaw : 'snooze';
    const [{ normalized: snoozed }, { normalized: dismissed }] = await Promise.all([
      readSnoozedMap(),
      readDismissedMap(),
    ]);

    if (action === 'clear') {
      delete snoozed[nudgeKey];
      delete dismissed[nudgeKey];

      await Promise.all([persistSnoozedMap(snoozed), persistDismissedMap(dismissed)]);

      return NextResponse.json({
        success: true,
        nudgeKey,
        action,
        expiresAt: null,
        dismissedAt: null,
        snoozed,
        dismissed,
      });
    }

    if (action === 'dismiss') {
      delete snoozed[nudgeKey];
      const dismissedAt = new Date().toISOString();
      dismissed[nudgeKey] = dismissedAt;

      await Promise.all([persistSnoozedMap(snoozed), persistDismissedMap(dismissed)]);

      return NextResponse.json({
        success: true,
        nudgeKey,
        action,
        expiresAt: null,
        dismissedAt,
        snoozed,
        dismissed,
      });
    }

    const snoozeDays = clampSmartNudgeSnoozeDays((body as { snoozeDays?: unknown }).snoozeDays);
    const expiresAt = new Date(Date.now() + snoozeDays * 24 * 60 * 60 * 1000).toISOString();
    snoozed[nudgeKey] = expiresAt;
    delete dismissed[nudgeKey];

    await Promise.all([persistSnoozedMap(snoozed), persistDismissedMap(dismissed)]);

    return NextResponse.json({
      success: true,
      nudgeKey,
      action,
      snoozeDays,
      expiresAt,
      dismissedAt: null,
      snoozed,
      dismissed,
    });
  } catch (error) {
    console.error('Update smart nudge state error:', error);
    return NextResponse.json(
      { error: 'Failed to update smart nudge state' },
      { status: 500 }
    );
  }
}
