export const TELEGRAM_REMINDER_SETTINGS_KEY = 'telegram_reminder_settings';
export const TELEGRAM_REMINDER_LAST_SENT_SLOT_KEY = 'telegram_reminder_last_sent_slot';
export const APP_TIMEZONE = 'Asia/Jerusalem';

export interface TelegramReminderSettings {
  enabled: boolean;
  dayOfWeek: number;
  hour: number;
  onlyIfNoUploadsInLast7Days: boolean;
  onlyIfMissingCurrentPeriodSources: boolean;
  onlyIfUncategorizedTransactions: boolean;
}

export const DEFAULT_TELEGRAM_REMINDER_SETTINGS: TelegramReminderSettings = {
  enabled: false,
  dayOfWeek: 4,
  hour: 19,
  onlyIfNoUploadsInLast7Days: true,
  onlyIfMissingCurrentPeriodSources: true,
  onlyIfUncategorizedTransactions: true,
};

export const REMINDER_WEEKDAY_OPTIONS = [
  { value: 0, label: 'יום ראשון' },
  { value: 1, label: 'יום שני' },
  { value: 2, label: 'יום שלישי' },
  { value: 3, label: 'יום רביעי' },
  { value: 4, label: 'יום חמישי' },
  { value: 5, label: 'יום שישי' },
  { value: 6, label: 'יום שבת' },
];

export function normalizeTelegramReminderSettings(
  input?: Partial<TelegramReminderSettings> | null
): TelegramReminderSettings {
  const dayOfWeek = Number.isInteger(input?.dayOfWeek)
    ? Math.min(6, Math.max(0, Number(input?.dayOfWeek)))
    : DEFAULT_TELEGRAM_REMINDER_SETTINGS.dayOfWeek;

  const hour = Number.isInteger(input?.hour)
    ? Math.min(23, Math.max(0, Number(input?.hour)))
    : DEFAULT_TELEGRAM_REMINDER_SETTINGS.hour;

  return {
    enabled: Boolean(input?.enabled),
    dayOfWeek,
    hour,
    onlyIfNoUploadsInLast7Days:
      input?.onlyIfNoUploadsInLast7Days ?? DEFAULT_TELEGRAM_REMINDER_SETTINGS.onlyIfNoUploadsInLast7Days,
    onlyIfMissingCurrentPeriodSources:
      input?.onlyIfMissingCurrentPeriodSources ??
      DEFAULT_TELEGRAM_REMINDER_SETTINGS.onlyIfMissingCurrentPeriodSources,
    onlyIfUncategorizedTransactions:
      input?.onlyIfUncategorizedTransactions ??
      DEFAULT_TELEGRAM_REMINDER_SETTINGS.onlyIfUncategorizedTransactions,
  };
}

export function getWeekdayLabel(dayOfWeek: number): string {
  return REMINDER_WEEKDAY_OPTIONS.find((option) => option.value === dayOfWeek)?.label || 'יום חמישי';
}

export function formatReminderHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}
