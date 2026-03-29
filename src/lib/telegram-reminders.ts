import dayjs from 'dayjs';
import { Markup } from 'telegraf';
import { getTelegramBotService } from '@/services/telegram/TelegramBotService';
import { getCurrentPeriodInsights } from '@/lib/current-period-insights';
import { getSmartNudgesStatus } from '@/lib/smart-nudges';
import { getTelegramReminderLastSentSlot, getTelegramReminderSettings, saveTelegramReminderLastSentSlot } from '@/lib/system-settings';
import { APP_TIMEZONE, formatReminderHour, getWeekdayLabel, TelegramReminderSettings } from '@/lib/telegram-reminder-config';
import { buildTelegramSmartNudgeCallbackData } from '@/lib/telegram-smart-nudge-actions';
import type { SmartNudge } from '@/lib/smart-nudge-types';

const WEEKDAY_INDEX_BY_SHORT_NAME: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

type ReminderReasonCode = 'no_uploads' | 'missing_sources' | 'uncategorized' | 'smart_nudge';

interface ReminderSnapshot {
  currentPeriodLabel: string;
  dateRangeLabel: string;
  missingSources: string[];
  recentUploadsLast7Days: number;
  uncategorizedCount: number;
  smartNudges: SmartNudge[];
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

function buildTriggeredReasons(
  settings: TelegramReminderSettings,
  smartNudges: SmartNudge[]
): ReminderSnapshot['triggeredReasons'] {
  const nudgesByKey = new Map(smartNudges.map((nudge) => [nudge.key, nudge]));
  const reasons: ReminderSnapshot['triggeredReasons'] = [];

  if (settings.onlyIfNoUploadsInLast7Days && nudgesByKey.has('stale-uploads')) {
    reasons.push({
      code: 'no_uploads',
      text: nudgesByKey.get('stale-uploads')?.title || 'לא נקלטו העלאות חדשות לאחרונה',
    });
  }

  if (settings.onlyIfMissingCurrentPeriodSources && nudgesByKey.has('missing-sources')) {
    reasons.push({
      code: 'missing_sources',
      text: nudgesByKey.get('missing-sources')?.title || 'חסרים מקורות לתקופה הנוכחית',
    });
  }

  if (settings.onlyIfUncategorizedTransactions && nudgesByKey.has('uncategorized')) {
    reasons.push({
      code: 'uncategorized',
      text: nudgesByKey.get('uncategorized')?.title || 'יש תנועות לא מסווגות בתקופה הנוכחית',
    });
  }

  for (const nudge of smartNudges) {
    if (
      nudge.priority === 'high' &&
      !['stale-uploads', 'missing-sources', 'uncategorized'].includes(nudge.key)
    ) {
      reasons.push({
        code: 'smart_nudge',
        text: `Smart Nudge בעדיפות גבוהה: ${nudge.title}`,
      });
    }
  }

  return reasons;
}

async function buildReminderSnapshot(settings: TelegramReminderSettings): Promise<ReminderSnapshot> {
  const insights = await getCurrentPeriodInsights();
  const smartNudgesStatus = await getSmartNudgesStatus(
    insights.periodMode,
    insights,
    insights.budgetStatus
  );
  const triggeredReasons = buildTriggeredReasons(settings, smartNudgesStatus.nudges);

  return {
    currentPeriodLabel: insights.periodLabel,
    dateRangeLabel: insights.dateRangeLabel,
    missingSources: insights.missingSources,
    recentUploadsLast7Days: insights.recentUploadsLast7Days,
    uncategorizedCount: insights.uncategorizedCount,
    smartNudges: smartNudgesStatus.nudges,
    triggeredReasons,
  };
}

function getNudgeEmoji(nudge: SmartNudge): string {
  if (nudge.key === 'missing-sources') {
    return '📥';
  }

  if (nudge.key === 'uncategorized') {
    return '🏷️';
  }

  if (nudge.key === 'stale-uploads') {
    return '🕒';
  }

  if (nudge.key === 'failed-uploads') {
    return '⚠️';
  }

  if (nudge.key === 'budget-overrun') {
    return '🚨';
  }

  if (nudge.key === 'budget-warning') {
    return '🎯';
  }

  return '💡';
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
  const heading = mode === 'test' ? '🧪 בדיקת Smart Nudges' : '🔔 Smart Nudges שבועיים';
  const lines = [
    heading,
    '',
    `תקופה: ${snapshot.currentPeriodLabel}`,
    snapshot.dateRangeLabel,
  ];

  if (snapshot.smartNudges.length > 0) {
    lines.push('');
    lines.push('מה דורש תשומת לב עכשיו:');

    snapshot.smartNudges.slice(0, 3).forEach((nudge) => {
      const prioritySuffix = nudge.priorityLabel ? ` · ${nudge.priorityLabel}` : '';
      lines.push(`${getNudgeEmoji(nudge)} ${nudge.title}${prioritySuffix}`);
      lines.push(nudge.description);
      lines.push(`פעולה: ${nudge.actionLabel}`);
      lines.push('');
    });

    if (snapshot.smartNudges.length > 3) {
      lines.push(`ועוד ${snapshot.smartNudges.length - 3} התראות חכמות פתוחות בלוח הבקרה.`);
    }
  } else {
    lines.push('');
    lines.push('כרגע אין Smart Nudges פעילים לפי מצב המערכת.');
  }

  if (snapshot.triggeredReasons.length > 0) {
    lines.push('');
    lines.push('מה הפעיל את התזכורת השבוע:');
    for (const reason of snapshot.triggeredReasons) {
      lines.push(`• ${reason.text}`);
    }
  }

  lines.push('');
  lines.push(`הגדרת תזכורת: ${settingsDescription}`);

  return lines.join('\n').trim();
}

function buildReminderKeyboard(snapshot: ReminderSnapshot) {
  const baseUrl = (process.env.APP_BASE_URL || 'https://osadchi-systems.com').replace(/\/+$/, '');
  const seenHrefs = new Set<string>();
  const rows = [];

  for (const nudge of snapshot.smartNudges) {
    if (seenHrefs.has(nudge.href)) {
      continue;
    }

    rows.push([Markup.button.url(nudge.actionLabel, `${baseUrl}${nudge.href}`)]);
    if (nudge.snoozeKey) {
      rows.push([
        Markup.button.callback('השהה לשבוע', buildTelegramSmartNudgeCallbackData('snooze', nudge.snoozeKey)),
        Markup.button.callback('סגור לתקופה', buildTelegramSmartNudgeCallbackData('dismiss', nudge.snoozeKey)),
      ]);
    }
    seenHrefs.add(nudge.href);

    if (seenHrefs.size >= 2) {
      break;
    }
  }

  rows.push([
    Markup.button.url('פתח לוח בקרה', `${baseUrl}/`),
    Markup.button.url('פתח סיכום חודשי', `${baseUrl}/monthly-summary`),
  ]);

  return Markup.inlineKeyboard(rows);
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

  if (!force && snapshot.triggeredReasons.length === 0) {
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
      currentPeriodSubLabel: snapshot.dateRangeLabel,
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
        currentPeriodSubLabel: snapshot.dateRangeLabel,
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
      currentPeriodSubLabel: snapshot.dateRangeLabel,
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
    currentPeriodSubLabel: snapshot.dateRangeLabel,
  };
}
