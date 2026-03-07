import { prisma } from '@/lib/prisma';
import { DEFAULT_PERIOD_MODE, PERIOD_MODE_SETTING_KEY, PeriodMode, normalizePeriodMode } from '@/lib/period-utils';
import {
  DEFAULT_TELEGRAM_REMINDER_SETTINGS,
  TELEGRAM_REMINDER_LAST_SENT_SLOT_KEY,
  TELEGRAM_REMINDER_SETTINGS_KEY,
  TelegramReminderSettings,
  normalizeTelegramReminderSettings,
} from '@/lib/telegram-reminder-config';

export async function getPeriodModeSetting(): Promise<PeriodMode> {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: PERIOD_MODE_SETTING_KEY },
    });
    return normalizePeriodMode(setting?.value);
  } catch {
    return DEFAULT_PERIOD_MODE;
  }
}

export async function getTelegramReminderSettings(): Promise<TelegramReminderSettings> {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: TELEGRAM_REMINDER_SETTINGS_KEY },
    });

    if (!setting) {
      return DEFAULT_TELEGRAM_REMINDER_SETTINGS;
    }

    return normalizeTelegramReminderSettings(JSON.parse(setting.value));
  } catch {
    return DEFAULT_TELEGRAM_REMINDER_SETTINGS;
  }
}

export async function saveTelegramReminderSettings(
  settings: TelegramReminderSettings
): Promise<TelegramReminderSettings> {
  const normalized = normalizeTelegramReminderSettings(settings);

  await prisma.setting.upsert({
    where: { key: TELEGRAM_REMINDER_SETTINGS_KEY },
    update: { value: JSON.stringify(normalized) },
    create: {
      key: TELEGRAM_REMINDER_SETTINGS_KEY,
      value: JSON.stringify(normalized),
    },
  });

  return normalized;
}

export async function getTelegramReminderLastSentSlot(): Promise<string | null> {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: TELEGRAM_REMINDER_LAST_SENT_SLOT_KEY },
    });
    return setting?.value || null;
  } catch {
    return null;
  }
}

export async function saveTelegramReminderLastSentSlot(slot: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key: TELEGRAM_REMINDER_LAST_SENT_SLOT_KEY },
    update: { value: slot },
    create: { key: TELEGRAM_REMINDER_LAST_SENT_SLOT_KEY, value: slot },
  });
}
