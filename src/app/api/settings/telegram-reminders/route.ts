import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getTelegramReminderSettings, saveTelegramReminderSettings } from '@/lib/system-settings';
import { normalizeTelegramReminderSettings } from '@/lib/telegram-reminder-config';

export async function GET() {
  try {
    const settings = await getTelegramReminderSettings();

    return NextResponse.json({
      settings,
      botConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      allowedChatsConfigured: Boolean(process.env.TELEGRAM_ALLOWED_CHAT_IDS?.trim()),
      reminderSecretConfigured: Boolean(process.env.TELEGRAM_REMINDER_SECRET?.trim()),
    });
  } catch (error) {
    console.error('Get telegram reminder settings error:', error);
    return NextResponse.json(
      {
        settings: normalizeTelegramReminderSettings(),
        botConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
        allowedChatsConfigured: Boolean(process.env.TELEGRAM_ALLOWED_CHAT_IDS?.trim()),
        reminderSecretConfigured: Boolean(process.env.TELEGRAM_REMINDER_SECRET?.trim()),
      }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const settings = normalizeTelegramReminderSettings(body);
    const savedSettings = await saveTelegramReminderSettings(settings);

    revalidatePath('/settings');

    return NextResponse.json({ success: true, settings: savedSettings });
  } catch (error) {
    console.error('Save telegram reminder settings error:', error);
    return NextResponse.json({ error: 'Failed to save telegram reminder settings' }, { status: 500 });
  }
}
