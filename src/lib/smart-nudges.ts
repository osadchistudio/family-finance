import 'server-only';

import dayjs from 'dayjs';
import { prisma } from '@/lib/prisma';
import { aggregateTransactionsByPeriod } from '@/lib/analytics';
import { formatCurrency } from '@/lib/formatters';
import { buildPeriods, getPeriodKey, type PeriodMode } from '@/lib/period-utils';
import {
  buildSmartNudgeSnoozeKey,
  getSmartNudgeDismissals,
  getSmartNudgeSnoozes,
  type DismissedSmartNudgeMap,
  type SnoozedSmartNudgeMap,
} from '@/lib/smart-nudge-snooze';
import type {
  SmartNudge,
  SmartNudgesStatus,
  SmartNudgeBudgetStatusInput,
  SmartNudgeCurrentPeriodStatusInput,
} from '@/lib/smart-nudge-types';

interface RecentPeriodIssueSnapshot {
  periodKey: string;
  missingSources: string[];
  uncategorizedCount: number;
}

function applySmartNudgeStates(
  periodKey: string,
  nudges: SmartNudge[],
  snoozed: SnoozedSmartNudgeMap,
  dismissed: DismissedSmartNudgeMap
): SmartNudge[] {
  return nudges
    .map((nudge) => {
      const snoozeKey = buildSmartNudgeSnoozeKey(periodKey, nudge.key);
      return {
        ...nudge,
        snoozeKey,
      };
    })
    .filter(
      (nudge) =>
        !nudge.snoozeKey || (!snoozed[nudge.snoozeKey] && !dismissed[nudge.snoozeKey])
    );
}

async function getRecentPeriodIssueSnapshots(
  periodMode: PeriodMode,
  options: {
    expectsBankData: boolean;
    expectsCreditData: boolean;
  }
): Promise<RecentPeriodIssueSnapshot[]> {
  const periods = buildPeriods(periodMode, dayjs(), 3);
  const firstPeriod = periods[0];
  const lastPeriod = periods[periods.length - 1];

  if (!firstPeriod || !lastPeriod) {
    return [];
  }

  const transactions = await prisma.transaction.findMany({
    where: {
      isExcluded: false,
      date: {
        gte: firstPeriod.startDate.startOf('day').toDate(),
        lte: lastPeriod.endDate.endOf('day').toDate(),
      },
    },
    select: {
      date: true,
      categoryId: true,
      amount: true,
      account: {
        select: {
          institution: true,
        },
      },
    },
  });

  const { periodAggregates } = aggregateTransactionsByPeriod(transactions, periods, periodMode);
  const uncategorizedCountsByPeriod = new Map<string, number>();

  for (const period of periods) {
    uncategorizedCountsByPeriod.set(period.key, 0);
  }

  for (const transaction of transactions) {
    if (transaction.categoryId) {
      continue;
    }

    const periodKey = getPeriodKey(dayjs(transaction.date), periodMode);
    uncategorizedCountsByPeriod.set(
      periodKey,
      (uncategorizedCountsByPeriod.get(periodKey) || 0) + 1
    );
  }

  return periods.map((period) => {
    const aggregate = periodAggregates[period.key];
    const hasBankData = (aggregate?.bankCount || 0) > 0;
    const hasCreditData = (aggregate?.creditCount || 0) > 0;
    const missingSources: string[] = [];

    if (options.expectsBankData && !hasBankData) {
      missingSources.push('עו"ש');
    }
    if (options.expectsCreditData && !hasCreditData) {
      missingSources.push('אשראי');
    }

    return {
      periodKey: period.key,
      missingSources,
      uncategorizedCount: uncategorizedCountsByPeriod.get(period.key) || 0,
    };
  });
}

function countConsecutivePeriodsWithIssue<T>(
  items: T[],
  hasIssue: (item: T) => boolean
): number {
  let count = 0;

  for (const item of [...items].reverse()) {
    if (!hasIssue(item)) {
      break;
    }
    count += 1;
  }

  return count;
}

function getRecurringIssuePriorityLabel(
  consecutivePeriods: number,
  fallbackLabel: string
): string {
  if (consecutivePeriods >= 3) {
    return `חוזר ${consecutivePeriods} תקופות`;
  }

  if (consecutivePeriods === 2) {
    return 'חוזר תקופה שנייה';
  }

  return fallbackLabel;
}

function getMissingSourcesActionLabel(missingSources: string[]): string {
  if (missingSources.length === 1) {
    return `העלה ${missingSources[0]}`;
  }

  return 'השלם נתונים';
}

function buildMissingSourcesDescription(
  missingSources: string[],
  consecutivePeriods: number
): string {
  const missingLabel = missingSources.join(' ו־');

  if (consecutivePeriods >= 3) {
    return `זו כבר תקופה ${consecutivePeriods} ברצף שחסרים ${missingLabel}. כדאי להשלים את המקורות עכשיו כדי לא להמשיך לעבוד עם תמונה חלקית.`;
  }

  if (consecutivePeriods === 2) {
    return `גם בתקופה הקודמת חסרו ${missingLabel}, ועכשיו הם עדיין לא נקלטו. כדאי להשלים את ההעלאה לפני שמסתמכים על המצב הנוכחי.`;
  }

  return `חסרים ${missingLabel}, ולכן כדאי להשלים נתונים לפני שמסתמכים על המצב הנוכחי.`;
}

function buildUncategorizedDescription(
  uncategorizedCount: number,
  consecutivePeriods: number
): string {
  if (consecutivePeriods >= 3) {
    return `יש כרגע ${uncategorizedCount} תנועות לא מסווגות, והנושא חוזר כבר ${consecutivePeriods} תקופות. כמה דקות של שיוך עכשיו יחזירו את הדשבורד וההתראות לתמונה נקייה יותר.`;
  }

  if (consecutivePeriods === 2) {
    return `יש כרגע ${uncategorizedCount} תנועות לא מסווגות, וגם בתקופה הקודמת נשארו תנועות פתוחות. כדאי לסגור את זה עכשיו לפני שזה מצטבר שוב.`;
  }

  return `יש כרגע ${uncategorizedCount} תנועות לא מסווגות בתקופה הנוכחית, וזה עלול לטשטש את תמונת המצב.`;
}

function getStaleUploadsDescription(daysSinceLastSuccess: number | null): string {
  if (daysSinceLastSuccess === null) {
    return 'עדיין לא נקלטה העלאה מוצלחת במערכת. אם יש פעילות חדשה, זה זמן טוב להזין אותה כדי להתחיל לקבל תמונת מצב אמינה.';
  }

  if (daysSinceLastSuccess >= 14) {
    return `העלאה מוצלחת אחרונה נקלטה לפני ${daysSinceLastSuccess} ימים. אם הייתה פעילות מאז, כדאי להשלים אותה עכשיו כדי לא להישאר מאחור.`;
  }

  return `ב־7 הימים האחרונים לא נקלטו קבצים חדשים. ההעלאה המוצלחת האחרונה הייתה לפני ${daysSinceLastSuccess} ימים, אז זה זמן טוב לבדוק אם חסר משהו.`;
}

function getBudgetOverrunDescription(status: SmartNudgeBudgetStatusInput): string {
  const projectedOverrun = Math.max(0, -status.projectedRemaining);
  if (projectedOverrun > 0) {
    return `תחזית סוף התקופה מצביעה על חריגה צפויה של ${formatCurrency(projectedOverrun)}. כדאי לעצור ולבצע התאמה כבר עכשיו, לפני שהפער יגדל.`;
  }

  return 'תחזית סוף התקופה מראה חריגה צפויה מהתקציב המשתנה, ולכן כדאי לעצור ולבצע התאמה כבר עכשיו.';
}

function getBudgetWarningDescription(status: SmartNudgeBudgetStatusInput): string {
  return `קצב המשתנות הנוכחי מוביל לתחזית של ${status.projectedUtilizationPercent.toFixed(0)}% שימוש מהתקציב. עדיין אפשר לבלום, אבל כדאי לבדוק את הקטגוריות המובילות כבר השבוע.`;
}

function buildFallbackSmartNudgesStatus(
  periodKey: string,
  currentPeriodStatus: SmartNudgeCurrentPeriodStatusInput,
  budgetStatus: SmartNudgeBudgetStatusInput,
  snoozed: SnoozedSmartNudgeMap = {},
  dismissed: DismissedSmartNudgeMap = {}
): SmartNudgesStatus {
  const nudges: SmartNudge[] = [];

  if (currentPeriodStatus.isPartial && currentPeriodStatus.missingSources.length > 0) {
    nudges.push({
      key: 'missing-sources',
      title: 'התמונה של התקופה עדיין חלקית',
      description: `חסרים ${currentPeriodStatus.missingSources.join(' ו־')} ולכן כדאי להשלים נתונים לפני שמסתמכים על המצב הנוכחי`,
      href: '/upload',
      actionLabel: getMissingSourcesActionLabel(currentPeriodStatus.missingSources),
      tone: 'warning',
      priority: 'medium',
      priorityLabel: 'כדאי השבוע',
    });
  }

  if (budgetStatus.paceStatus === 'over') {
    nudges.push({
      key: 'budget-overrun',
      title: 'בקצב הנוכחי צפויה חריגה במשתנות',
      description: 'קצב ההוצאות המשתנות גבוה מהמסגרת שתוכננה, ולכן כדאי לבצע התאמה לפני סוף התקופה',
      href: '/monthly-summary',
      actionLabel: 'פתח תקציב משתנות',
      tone: 'danger',
      priority: 'high',
      priorityLabel: 'דורש טיפול',
    });
  } else if (budgetStatus.paceStatus === 'warning') {
    nudges.push({
      key: 'budget-warning',
      title: 'קצב המשתנות מתחיל לאותת על סיכון',
      description: 'התחזית עדיין ניתנת לבלימה, אבל כדאי לעקוב מקרוב אחרי הקצב בימים הקרובים',
      href: '/monthly-summary',
      actionLabel: 'בדוק תחזית תקציב',
      tone: 'warning',
      priority: 'medium',
      priorityLabel: 'כדאי השבוע',
    });
  }

  return {
    periodLabel: currentPeriodStatus.periodLabel,
    nudges: applySmartNudgeStates(periodKey, nudges, snoozed, dismissed),
  };
}

export async function getSmartNudgesStatus(
  periodMode: PeriodMode,
  currentPeriodStatus: SmartNudgeCurrentPeriodStatusInput,
  budgetStatus: SmartNudgeBudgetStatusInput
): Promise<SmartNudgesStatus> {
  const [snoozed, dismissed] = await Promise.all([
    getSmartNudgeSnoozes(),
    getSmartNudgeDismissals(),
  ]);
  const currentPeriod = buildPeriods(periodMode, dayjs(), 1)[0];
  const periodKey = currentPeriod?.key || budgetStatus.periodKey || dayjs().format('YYYY-MM');

  if (!currentPeriod) {
    return buildFallbackSmartNudgesStatus(
      periodKey,
      currentPeriodStatus,
      budgetStatus,
      snoozed,
      dismissed
    );
  }

  try {
    const staleWindowStart = dayjs().subtract(7, 'day').startOf('day').toDate();
    const failedWindowStart = dayjs().subtract(14, 'day').startOf('day').toDate();

    const [
      uncategorizedCount,
      failedUploadsCount,
      recentSuccessfulUploadsCount,
      latestSuccessfulUpload,
      recentPeriodIssues,
    ] = await Promise.all([
      prisma.transaction.count({
        where: {
          isExcluded: false,
          categoryId: null,
          date: {
            gte: currentPeriod.startDate.startOf('day').toDate(),
            lte: currentPeriod.endDate.endOf('day').toDate(),
          },
        },
      }),
      prisma.fileUpload.count({
        where: {
          status: 'FAILED',
          processedAt: {
            gte: failedWindowStart,
          },
        },
      }),
      prisma.fileUpload.count({
        where: {
          status: 'COMPLETED',
          processedAt: {
            gte: staleWindowStart,
          },
        },
      }),
      prisma.fileUpload.findFirst({
        where: {
          status: 'COMPLETED',
        },
        orderBy: {
          processedAt: 'desc',
        },
        select: {
          processedAt: true,
        },
      }),
      getRecentPeriodIssueSnapshots(periodMode, {
        expectsBankData: currentPeriodStatus.expectsBankData,
        expectsCreditData: currentPeriodStatus.expectsCreditData,
      }),
    ]);

    const nudges: SmartNudge[] = [];
    const missingSourcesConsecutivePeriods = countConsecutivePeriodsWithIssue(
      recentPeriodIssues,
      (item) => item.missingSources.length > 0
    );
    const uncategorizedConsecutivePeriods = countConsecutivePeriodsWithIssue(
      recentPeriodIssues,
      (item) => item.uncategorizedCount > 0
    );
    const daysSinceLastSuccessfulUpload = latestSuccessfulUpload?.processedAt
      ? Math.max(
          0,
          dayjs().startOf('day').diff(dayjs(latestSuccessfulUpload.processedAt).startOf('day'), 'day')
        )
      : null;

    if (currentPeriodStatus.isPartial && currentPeriodStatus.missingSources.length > 0) {
      nudges.push({
        key: 'missing-sources',
        title:
          missingSourcesConsecutivePeriods >= 2
            ? 'חסרים נתונים שחוזרים על עצמם'
            : 'התמונה של התקופה עדיין חלקית',
        description: buildMissingSourcesDescription(
          currentPeriodStatus.missingSources,
          missingSourcesConsecutivePeriods
        ),
        href: '/upload',
        actionLabel: getMissingSourcesActionLabel(currentPeriodStatus.missingSources),
        tone: missingSourcesConsecutivePeriods >= 3 ? 'danger' : 'warning',
        priority: missingSourcesConsecutivePeriods >= 2 ? 'high' : 'medium',
        priorityLabel: getRecurringIssuePriorityLabel(
          missingSourcesConsecutivePeriods,
          currentPeriodStatus.missingSources.length > 1 ? 'חסרים כמה מקורות' : 'חסר מקור פעיל'
        ),
      });
    }

    if (recentSuccessfulUploadsCount === 0) {
      nudges.push({
        key: 'stale-uploads',
        title:
          daysSinceLastSuccessfulUpload !== null && daysSinceLastSuccessfulUpload >= 14
            ? 'לא נקלטו העלאות כבר יותר משבועיים'
            : 'לא נקלטו העלאות חדשות לאחרונה',
        description: getStaleUploadsDescription(daysSinceLastSuccessfulUpload),
        href: '/upload',
        actionLabel:
          daysSinceLastSuccessfulUpload === null ? 'העלה קובץ ראשון' : 'בדוק אם חסרה העלאה',
        tone:
          daysSinceLastSuccessfulUpload !== null && daysSinceLastSuccessfulUpload >= 14
            ? 'warning'
            : 'info',
        priority:
          daysSinceLastSuccessfulUpload !== null && daysSinceLastSuccessfulUpload >= 14
            ? 'high'
            : 'medium',
        priorityLabel:
          daysSinceLastSuccessfulUpload !== null && daysSinceLastSuccessfulUpload >= 14
            ? 'מתעכב כבר זמן מה'
            : 'כדאי לרענן',
      });
    }

    if (uncategorizedCount > 0) {
      const highUncategorizedPressure =
        uncategorizedCount >= 10 || uncategorizedConsecutivePeriods >= 3;

      nudges.push({
        key: 'uncategorized',
        title:
          uncategorizedConsecutivePeriods >= 2
            ? 'לא מסווגות שממשיכות להצטבר'
            : 'יש תנועות שמחכות לשיוך',
        description: buildUncategorizedDescription(
          uncategorizedCount,
          uncategorizedConsecutivePeriods
        ),
        href: '/transactions?categoryId=uncategorized',
        actionLabel: highUncategorizedPressure ? 'שייך תנועות עכשיו' : 'פתח לא מסווגות',
        tone: highUncategorizedPressure ? 'danger' : 'warning',
        priority:
          highUncategorizedPressure || uncategorizedConsecutivePeriods >= 2 ? 'high' : 'medium',
        priorityLabel: getRecurringIssuePriorityLabel(
          uncategorizedConsecutivePeriods,
          `${uncategorizedCount} פתוחות`
        ),
      });
    }

    if (failedUploadsCount > 0) {
      nudges.push({
        key: 'failed-uploads',
        title: 'נמצאו העלאות שנכשלו לאחרונה',
        description: `ב־14 הימים האחרונים נמצאו ${failedUploadsCount} העלאות שנכשלו, ויכול להיות שחסרים נתונים שכדאי להשלים`,
        href: '/upload',
        actionLabel: 'פתח העלאות שנכשלו',
        tone: 'danger',
        priority: failedUploadsCount >= 2 ? 'high' : 'medium',
        priorityLabel: failedUploadsCount >= 2 ? 'חוזר שוב' : 'דורש בדיקה',
      });
    }

    if (budgetStatus.paceStatus === 'over') {
      nudges.push({
        key: 'budget-overrun',
        title: 'בקצב הנוכחי צפויה חריגה במשתנות',
        description: getBudgetOverrunDescription(budgetStatus),
        href: '/monthly-summary',
        actionLabel: 'פתח תקציב משתנות',
        tone: 'danger',
        priority: 'high',
        priorityLabel:
          budgetStatus.overCount > 0
            ? `${budgetStatus.overCount} קטגוריות כבר חורגות`
            : 'דורש טיפול',
      });
    } else if (budgetStatus.paceStatus === 'warning') {
      nudges.push({
        key: 'budget-warning',
        title: 'קצב המשתנות דורש בדיקה השבוע',
        description: getBudgetWarningDescription(budgetStatus),
        href: '/monthly-summary',
        actionLabel: 'בדוק תחזית תקציב',
        tone: 'warning',
        priority: 'medium',
        priorityLabel:
          budgetStatus.warningCount > 0
            ? `${budgetStatus.warningCount} קטגוריות בסיכון`
            : 'כדאי השבוע',
      });
    }

    return {
      periodLabel: currentPeriodStatus.periodLabel,
      nudges: applySmartNudgeStates(periodKey, nudges, snoozed, dismissed),
    };
  } catch (error) {
    console.error('Smart nudges load error:', error);
    return buildFallbackSmartNudgesStatus(
      periodKey,
      currentPeriodStatus,
      budgetStatus,
      snoozed,
      dismissed
    );
  }
}
