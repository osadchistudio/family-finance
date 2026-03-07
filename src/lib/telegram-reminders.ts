import dayjs from 'dayjs';
import { Markup } from 'telegraf';
import { prisma } from '@/lib/prisma';
import { getTelegramBotService } from '@/services/telegram/TelegramBotService';
import { buildPeriods, isBankInstitution, isCreditInstitution } from '@/lib/period-utils';
import { getPeriodModeSetting, getTelegramReminderLastSentSlot, getTelegramReminderSettings, saveTelegramReminderLastSentSlot } from '@/lib/system-settings';
import { APP_TIMEZONE, formatReminderHour, getWeekdayLabel, TelegramReminderSettings } from '@/lib/telegram-reminder-config';

const WEEKDAY_INDEX_BY_SHORT_NAME: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

type ReminderReasonCode = 'no_uploads' | 'missing_sources' | 'uncategorized';

interface ReminderSnapshot {
  currentPeriodLabel: string;
  currentPeriodSubLabel: string;
  missingSources: string[];
  recentUploadsLast7Days: number;
  uncategorizedCount: number;
  triggeredReasons: Array<{
    code: ReminderReasonCode;
    text: string;
  }>;
}

export interface TelegramReminderRunResult {
  status: 'sent' | 'skipped' | 'failed';
  mode: 'scheduled' | 'test';
  reason?: string;
  recipientCount: number;
  triggeredReasons: string[];
  missingSources: string[];
  recentUploadsLast7Days: number;
  uncategorizedCount: number;
  currentPeriodLabel: string;
  currentPeriodSubLabel: string;
}

function getJerusalemNow() {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date())
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  return {
    weekday: WEEKDAY_INDEX_BY_SHORT_NAME[parts.weekday] ?? 4,
    hour: Number(parts.hour),
    slot: `${parts.year}-${parts.month}-${parts.day}-${parts.hour}`,
    date: dayjs(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:00:00`),
  };
}

async function buildReminderSnapshot(settings: TelegramReminderSettings): Promise<ReminderSnapshot> {
  const [periodMode, accounts] = await Promise.all([
    getPeriodModeSetting(),
    prisma.account.findMany({
      distinct: ['institution'],
      select: { institution: true },
    }),
  ]);

  const now = getJerusalemNow();
  const currentPeriod = buildPeriods(periodMode, now.date, 1)[0];
  const startDate = currentPeriod.startDate.startOf('day').toDate();
  const endDate = currentPeriod.endDate.endOf('day').toDate();

  const [recentUploadsLast7Days, periodTransactions] = await Promise.all([
    prisma.fileUpload.count({
      where: {
        processedAt: {
          gte: dayjs().subtract(7, 'day').toDate(),
        },
      },
    }),
    prisma.transaction.findMany({
      where: {
        isExcluded: false,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        categoryId: true,
        account: {
          select: {
            institution: true,
          },
        },
      },
    }),
  ]);

  const requiresBank = accounts.some((account) => isBankInstitution(account.institution));
  const requiresCredit = accounts.some((account) => isCreditInstitution(account.institution));
  const hasBankInCurrentPeriod = periodTransactions.some((tx) => isBankInstitution(tx.account.institution));
  const hasCreditInCurrentPeriod = periodTransactions.some((tx) => isCreditInstitution(tx.account.institution));

  const missingSources: string[] = [];
  if (requiresBank && !hasBankInCurrentPeriod) {
    missingSources.push('עו"ש');
  }
  if (requiresCredit && !hasCreditInCurrentPeriod) {
    missingSources.push('אשראי');
  }

  const uncategorizedCount = periodTransactions.filter((tx) => !tx.categoryId).length;
  const triggeredReasons: ReminderSnapshot['triggeredReasons'] = [];

  if (settings.onlyIfNoUploadsInLast7Days && recentUploadsLast7Days === 0) {
    triggeredReasons.push({
      code: 'no_uploads',
      text: 'לא בוצעה העלאה ב-7 הימים האחרונים',
    });
  }

  if (settings.onlyIfMissingCurrentPeriodSources && missingSources.length > 0) {
    triggeredReasons.push({
      code: 'missing_sources',
      text: `חסרים מקורות בתקופה הנוכחית: ${missingSources.join(', ')}`,
    });
  }

  if (settings.onlyIfUncategorizedTransactions && uncategorizedCount > 0) {
    triggeredReasons.push({
      code: 'uncategorized',
      text: `יש ${uncategorizedCount} תנועות לא משויכות בתקופה הנוכחית`,
    });
  }

  return {
    currentPeriodLabel: currentPeriod.label,
    currentPeriodSubLabel: currentPeriod.subLabel,
    missingSources,
    recentUploadsLast7Days,
    uncategorizedCount,
    triggeredReasons,
  };
}

function formatReminderMessage({
  snapshot,
  settingsDescription,
  mode,
}: {
  snapshot: ReminderSnapshot;
  settingsDescription: string;
  mode: 'scheduled' | 'test';
}) {
  const heading = mode === 'test' ? '🧪 בדיקת תזכורת' : '⏰ תזכורת שבועית';
  const lines = [
    heading,
    '',
    `תקופה נוכחית: ${snapshot.currentPeriodLabel}`,
    snapshot.currentPeriodSubLabel,
    '',
  ];

  if (snapshot.triggeredReasons.length > 0) {
    lines.push('מה דורש תשומת לב:');
    snapshot.triggeredReasons.forEach((reason) => lines.push(`• ${reason.text}`));
  } else {
    lines.push('כרגע לא זוהתה בעיה דחופה לפי הכללים שסימנת');
  }

  lines.push('');
  lines.push(`הגדרת תזכורת: ${settingsDescription}`);

  return lines.join('\n').trim();
}

function buildReminderKeyboard(snapshot: ReminderSnapshot) {
  const baseUrl = (process.env.APP_BASE_URL || 'https://osadchi-systems.com').replace(/\/+$/, '');
  const buttons = [[Markup.button.url('פתח העלאות', `${baseUrl}/upload`)]];

  if (snapshot.uncategorizedCount > 0) {
    buttons.push([
      Markup.button.url('פתח לא מסווגות', `${baseUrl}/transactions?categoryId=uncategorized`),
    ]);
  }

  buttons.push([Markup.button.url('פתח תנועות', `${baseUrl}/transactions`)]);

  return Markup.inlineKeyboard(buttons);
}

export async function runTelegramReminder({
  force = false,
  settingsOverride,
}: {
  force?: boolean;
  settingsOverride?: TelegramReminderSettings;
} = {}): Promise<TelegramReminderRunResult> {
  const settings = settingsOverride || await getTelegramReminderSettings();
  const now = getJerusalemNow();

  if (!force && !settings.enabled) {
    return {
      status: 'skipped',
      mode: 'scheduled',
      reason: 'disabled',
      recipientCount: 0,
      triggeredReasons: [],
      missingSources: [],
      recentUploadsLast7Days: 0,
      uncategorizedCount: 0,
      currentPeriodLabel: '',
      currentPeriodSubLabel: '',
    };
  }

  if (!force && (now.weekday !== settings.dayOfWeek || now.hour !== settings.hour)) {
    return {
      status: 'skipped',
      mode: 'scheduled',
      reason: 'outside_schedule_window',
      recipientCount: 0,
      triggeredReasons: [],
      missingSources: [],
      recentUploadsLast7Days: 0,
      uncategorizedCount: 0,
      currentPeriodLabel: '',
      currentPeriodSubLabel: '',
    };
  }

  const snapshot = await buildReminderSnapshot(settings);
  const trackedConditionsEnabled =
    settings.onlyIfNoUploadsInLast7Days ||
    settings.onlyIfMissingCurrentPeriodSources ||
    settings.onlyIfUncategorizedTransactions;

  if (!force && trackedConditionsEnabled && snapshot.triggeredReasons.length === 0) {
    return {
      status: 'skipped',
      mode: 'scheduled',
      reason: 'conditions_not_met',
      recipientCount: 0,
      triggeredReasons: [],
      missingSources: snapshot.missingSources,
      recentUploadsLast7Days: snapshot.recentUploadsLast7Days,
      uncategorizedCount: snapshot.uncategorizedCount,
      currentPeriodLabel: snapshot.currentPeriodLabel,
      currentPeriodSubLabel: snapshot.currentPeriodSubLabel,
    };
  }

  if (!force) {
    const lastSentSlot = await getTelegramReminderLastSentSlot();
    if (lastSentSlot === now.slot) {
      return {
        status: 'skipped',
        mode: 'scheduled',
        reason: 'already_sent_for_slot',
        recipientCount: 0,
        triggeredReasons: snapshot.triggeredReasons.map((reason) => reason.text),
        missingSources: snapshot.missingSources,
        recentUploadsLast7Days: snapshot.recentUploadsLast7Days,
        uncategorizedCount: snapshot.uncategorizedCount,
        currentPeriodLabel: snapshot.currentPeriodLabel,
        currentPeriodSubLabel: snapshot.currentPeriodSubLabel,
      };
    }
  }

  const botService = getTelegramBotService();
  const settingsDescription = `${getWeekdayLabel(settings.dayOfWeek)}, ${formatReminderHour(settings.hour)}`;
  const sentCount = await botService.sendMessageToAllowedChats(
    formatReminderMessage({
      snapshot,
      settingsDescription,
      mode: force ? 'test' : 'scheduled',
    }),
    buildReminderKeyboard(snapshot)
  );

  if (sentCount === 0) {
    return {
      status: 'failed',
      mode: force ? 'test' : 'scheduled',
      reason: 'no_allowed_chat_ids',
      recipientCount: 0,
      triggeredReasons: snapshot.triggeredReasons.map((reason) => reason.text),
      missingSources: snapshot.missingSources,
      recentUploadsLast7Days: snapshot.recentUploadsLast7Days,
      uncategorizedCount: snapshot.uncategorizedCount,
      currentPeriodLabel: snapshot.currentPeriodLabel,
      currentPeriodSubLabel: snapshot.currentPeriodSubLabel,
    };
  }

  if (!force) {
    await saveTelegramReminderLastSentSlot(now.slot);
  }

  return {
    status: 'sent',
    mode: force ? 'test' : 'scheduled',
    recipientCount: sentCount,
    triggeredReasons: snapshot.triggeredReasons.map((reason) => reason.text),
    missingSources: snapshot.missingSources,
    recentUploadsLast7Days: snapshot.recentUploadsLast7Days,
    uncategorizedCount: snapshot.uncategorizedCount,
    currentPeriodLabel: snapshot.currentPeriodLabel,
    currentPeriodSubLabel: snapshot.currentPeriodSubLabel,
  };
}
