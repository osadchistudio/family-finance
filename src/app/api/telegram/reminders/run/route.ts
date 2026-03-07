import { NextRequest, NextResponse } from 'next/server';
import { runTelegramReminder } from '@/lib/telegram-reminders';

function isAuthorized(request: NextRequest) {
  const configuredSecret = process.env.TELEGRAM_REMINDER_SECRET?.trim();

  if (!configuredSecret) {
    return false;
  }

  const headerSecret = request.headers.get('x-telegram-reminder-secret')?.trim();
  return headerSecret === configuredSecret;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runTelegramReminder();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error('Telegram reminder run error:', error);
    return NextResponse.json({ error: 'Failed to run telegram reminder' }, { status: 500 });
  }
}
