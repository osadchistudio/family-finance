import { NextRequest, NextResponse } from 'next/server';
import {
  parseSmartNudgeKey,
  persistSmartNudgeDismissedMap,
  persistSmartNudgeSnoozedMap,
  readSmartNudgeDismissedMap,
  readSmartNudgeSnoozedMap,
  updateSmartNudgeState,
} from '@/lib/smart-nudge-snooze';

export async function GET() {
  try {
    const [
      { setting: snoozeSetting, normalized: snoozed },
      { setting: dismissedSetting, normalized: dismissed },
    ] = await Promise.all([readSmartNudgeSnoozedMap(), readSmartNudgeDismissedMap()]);

    const normalizedSnoozedValue = JSON.stringify(snoozed);
    if (snoozeSetting?.value !== normalizedSnoozedValue) {
      await persistSmartNudgeSnoozedMap(snoozed);
    }

    const normalizedDismissedValue = JSON.stringify(dismissed);
    if (dismissedSetting?.value !== normalizedDismissedValue) {
      await persistSmartNudgeDismissedMap(dismissed);
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

    const action = actionRaw === 'clear' || actionRaw === 'dismiss' ? actionRaw : 'snooze';
    const result = await updateSmartNudgeState({
      nudgeKey,
      action,
      snoozeDays: (body as { snoozeDays?: unknown }).snoozeDays as number | undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Update smart nudge state error:', error);
    return NextResponse.json(
      { error: 'Failed to update smart nudge state' },
      { status: 500 }
    );
  }
}
