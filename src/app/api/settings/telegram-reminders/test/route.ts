import { NextResponse } from 'next/server';
import { runTelegramReminder } from '@/lib/telegram-reminders';
import { normalizeTelegramReminderSettings } from '@/lib/telegram-reminder-config';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await runTelegramReminder({
      force: true,
      settingsOverride: normalizeTelegramReminderSettings(body),
    });

    if (result.status === 'failed') {
      return NextResponse.json(
        {
          error: 'Failed to send telegram reminder test',
          result,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('Telegram reminder test error:', error);
    return NextResponse.json({ error: 'Failed to send telegram reminder test' }, { status: 500 });
  }
}
