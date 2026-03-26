import { prisma } from '@/lib/prisma';
import { SummaryCard } from '@/components/dashboard/SummaryCard';
import { ExpenseChart } from '@/components/dashboard/ExpenseChart';
import { CategoryPieChart } from '@/components/dashboard/CategoryPieChart';
import {
  CurrentActionItem,
  CurrentActionItemsCard,
  CurrentActionItemsStatus,
} from '@/components/dashboard/CurrentActionItemsCard';
import {
  CurrentPeriodStatus,
  CurrentPeriodStatusCard,
} from '@/components/dashboard/CurrentPeriodStatusCard';
import { RecentTransactions } from '@/components/dashboard/RecentTransactions';
import {
  VariableBudgetAlert,
  VariableBudgetStatus,
  VariableBudgetStatusCard,
} from '@/components/dashboard/VariableBudgetStatusCard';
import {
  SmartNudge,
  SmartNudgesCard,
  SmartNudgesStatus,
} from '@/components/dashboard/SmartNudgesCard';
import dayjs from 'dayjs';
import { Decimal } from 'decimal.js';
import { formatCurrency } from '@/lib/formatters';
import { buildPeriodLabels, buildPeriods, getPeriodKey, PeriodMode, RECENT_AVERAGE_PERIODS } from '@/lib/period-utils';
import { getPeriodModeSetting } from '@/lib/system-settings';
import { getVariableBudgetPlan } from '@/lib/variable-budget';
import {
  buildSmartNudgeSnoozeKey,
  getSmartNudgeDismissals,
  getSmartNudgeSnoozes,
  type DismissedSmartNudgeMap,
  type SnoozedSmartNudgeMap,
} from '@/lib/smart-nudge-snooze';
import {
  aggregateTransactionsByPeriod,
  buildAverageCategoryBreakdown,
  buildMonthlyTrends,
  selectPeriodsForAverages,
} from '@/lib/analytics';

export const dynamic = 'force-dynamic';

interface DashboardAnalytics {
  averageMonthlyIncome: number;
  averageMonthlyExpense: number;
  averageMonthlyBalance: number;
  averageMonthlySavings: number;
  periodsUsedForAverageCount: number;
  incompletePeriodsWithDataCount: number;
  periodLabel: string;
  monthlyTrends: Array<{
    month: string;
    monthHebrew: string;
    income: number;
    expense: number;
    balance: number;
  }>;
  categoryBreakdown: Array<{
    name: string;
    value: number;
    color: string;
    icon: string;
  }>;
}

interface RecentTransactionItem {
  id: string;
  date: string;
  description: string;
  amount: string;
  category: {
    name: string;
    icon: string;
    color: string;
  } | null;
}

interface RecentPeriodIssueSnapshot {
  periodKey: string;
  missingSources: string[];
  uncategorizedCount: number;
}

function buildFallbackAnalytics(periodMode: PeriodMode): DashboardAnalytics {
  return {
    averageMonthlyIncome: 0,
    averageMonthlyExpense: 0,
    averageMonthlyBalance: 0,
    averageMonthlySavings: 0,
    periodsUsedForAverageCount: 0,
    incompletePeriodsWithDataCount: 0,
    periodLabel: buildPeriodLabels(periodMode).short,
    monthlyTrends: [],
    categoryBreakdown: [],
  };
}

function buildFallbackBudgetStatus(periodLabel: string, periodKey: string): VariableBudgetStatus {
  return {
    hasPlan: false,
    periodKey,
    periodLabel,
    updatedAt: '',
    plannedTotal: 0,
    actualTotal: 0,
    remainingTotal: 0,
    utilizationPercent: 0,
    projectedTotal: 0,
    projectedRemaining: 0,
    projectedUtilizationPercent: 0,
    averageDailyActual: 0,
    plannedDailyAllowanceRemaining: null,
    totalDays: 0,
    elapsedDays: 0,
    remainingDays: 0,
    paceStatus: 'on-track',
    warningCount: 0,
    overCount: 0,
    alerts: [],
  };
}

function buildFallbackCurrentPeriodStatus(periodMode: PeriodMode): CurrentPeriodStatus {
  const currentPeriod = buildPeriods(periodMode, dayjs(), 1)[0];
  const periodKey = currentPeriod?.key || dayjs().format('YYYY-MM');
  const periodLabel = currentPeriod
    ? `${currentPeriod.label} ${currentPeriod.subLabel}`.trim()
    : periodKey;
  const dateRangeLabel = currentPeriod
    ? `${currentPeriod.startDate.format('DD/MM/YYYY')} - ${currentPeriod.endDate.format('DD/MM/YYYY')}`
    : dayjs().format('DD/MM/YYYY');
  const totalDays = currentPeriod
    ? currentPeriod.endDate.startOf('day').diff(currentPeriod.startDate.startOf('day'), 'day') + 1
    : 0;

  return {
    periodLabel,
    dateRangeLabel,
    income: 0,
    expense: 0,
    balance: 0,
    averageDailyExpense: 0,
    remainingDailyBudget: null,
    totalDays,
    elapsedDays: 0,
    remainingDays: totalDays,
    transactionCount: 0,
    hasAnyData: false,
    expectsBankData: false,
    expectsCreditData: false,
    hasBankData: false,
    hasCreditData: false,
    missingSources: [],
    isPartial: false,
  };
}

function buildFallbackCurrentActionItems(
  currentPeriodStatus: CurrentPeriodStatus,
  budgetStatus: VariableBudgetStatus
): CurrentActionItemsStatus {
  const items: CurrentActionItem[] = [];

  if (currentPeriodStatus.isPartial && currentPeriodStatus.missingSources.length > 0) {
    items.push({
      key: 'missing-sources',
      title: 'חסרים מקורות לתקופה הנוכחית',
      description: `עדיין לא נקלטו ${currentPeriodStatus.missingSources.join(' ו־')} ולכן התמונה חלקית`,
      href: '/upload',
      count: currentPeriodStatus.missingSources.length,
      tone: 'warning',
    });
  }

  const budgetAlertsCount = budgetStatus.warningCount + budgetStatus.overCount;
  if (budgetAlertsCount > 0) {
    items.push({
      key: 'budget-alerts',
      title: 'התראות תקציב משתנות',
      description: `יש ${budgetAlertsCount} קטגוריות שמתקרבות לתקרה או כבר חרגו ממנה`,
      href: '/monthly-summary',
      count: budgetAlertsCount,
      tone: budgetStatus.overCount > 0 ? 'danger' : 'warning',
    });
  }

  return {
    periodLabel: currentPeriodStatus.periodLabel,
    items,
    totalOpenItems: items.reduce((sum, item) => sum + item.count, 0),
  };
}

function buildFallbackSmartNudgesStatus(
  periodKey: string,
  currentPeriodStatus: CurrentPeriodStatus,
  budgetStatus: VariableBudgetStatus,
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
      amount: true,
      categoryId: true,
      account: {
        select: {
          institution: true,
        },
      },
    },
  });

  const { periodAggregates } = aggregateTransactionsByPeriod(
    transactions,
    periods,
    periodMode
  );

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

function getBudgetOverrunDescription(status: VariableBudgetStatus): string {
  const projectedOverrun = Math.max(0, -status.projectedRemaining);
  if (projectedOverrun > 0) {
    return `תחזית סוף התקופה מצביעה על חריגה צפויה של ${formatCurrency(projectedOverrun)}. כדאי לעצור ולבצע התאמה כבר עכשיו, לפני שהפער יגדל.`;
  }

  return 'תחזית סוף התקופה מראה חריגה צפויה מהתקציב המשתנה, ולכן כדאי לעצור ולבצע התאמה כבר עכשיו.';
}

function getBudgetWarningDescription(status: VariableBudgetStatus): string {
  return `קצב המשתנות הנוכחי מוביל לתחזית של ${status.projectedUtilizationPercent.toFixed(0)}% שימוש מהתקציב. עדיין אפשר לבלום, אבל כדאי לבדוק את הקטגוריות המובילות כבר השבוע.`;
}

async function getAnalyticsData(periodMode: PeriodMode): Promise<DashboardAnalytics> {
  const periods = buildPeriods(periodMode, dayjs(), RECENT_AVERAGE_PERIODS);
  const startDate = periods[0].startDate.startOf('day').toDate();
  const endDate = periods[periods.length - 1].endDate.endOf('day').toDate();

  const transactions = await prisma.transaction.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
      isExcluded: false
    },
    select: {
      date: true,
      amount: true,
      category: {
        select: {
          id: true,
          name: true,
          color: true,
          icon: true,
        },
      },
      account: {
        select: {
          institution: true,
        },
      },
    }
  });

  const { periodAggregates, categoryAggregates, requiredSources } = aggregateTransactionsByPeriod(
    transactions,
    periods,
    periodMode
  );
  const { periodKeysWithData, completePeriodKeys } =
    selectPeriodsForAverages(periodAggregates, requiredSources);

  const periodsUsedForAverage = completePeriodKeys;
  const periodsForAverageCount = Math.max(periodsUsedForAverage.length, 1);
  const periodsForDashboard = periods.filter((period) => periodsUsedForAverage.includes(period.key));

  const monthlyTrends = buildMonthlyTrends(periodsForDashboard, periodAggregates);
  const categoryBreakdown = buildAverageCategoryBreakdown(
    categoryAggregates,
    periodsUsedForAverage,
    periodsForAverageCount
  );

  const totalIncome = periodsUsedForAverage.reduce(
    (sum, key) => sum.plus(periodAggregates[key]?.income || 0),
    new Decimal(0)
  );
  const totalExpense = periodsUsedForAverage.reduce(
    (sum, key) => sum.plus(periodAggregates[key]?.expense || 0),
    new Decimal(0)
  );
  const averageMonthlyIncome = periodsUsedForAverage.length > 0
    ? totalIncome.div(periodsForAverageCount).toNumber()
    : 0;
  const averageMonthlyExpense = periodsUsedForAverage.length > 0
    ? totalExpense.div(periodsForAverageCount).toNumber()
    : 0;
  const averageMonthlyBalance = averageMonthlyIncome - averageMonthlyExpense;

  return {
    averageMonthlyIncome,
    averageMonthlyExpense,
    averageMonthlyBalance,
    averageMonthlySavings: Math.max(0, averageMonthlyBalance),
    periodsUsedForAverageCount: periodsUsedForAverage.length,
    incompletePeriodsWithDataCount: Math.max(0, periodKeysWithData.length - completePeriodKeys.length),
    periodLabel: buildPeriodLabels(periodMode).short,
    monthlyTrends,
    categoryBreakdown
  };
}

async function getCurrentPeriodStatus(periodMode: PeriodMode): Promise<CurrentPeriodStatus> {
  const now = dayjs();
  const periods = buildPeriods(periodMode, now, RECENT_AVERAGE_PERIODS);
  const currentPeriod = periods[periods.length - 1];

  if (!currentPeriod) {
    return buildFallbackCurrentPeriodStatus(periodMode);
  }

  try {
    const transactions = await prisma.transaction.findMany({
      where: {
        date: {
          gte: periods[0].startDate.startOf('day').toDate(),
          lte: currentPeriod.endDate.endOf('day').toDate(),
        },
        isExcluded: false,
      },
      select: {
        date: true,
        amount: true,
        account: {
          select: {
            institution: true,
          },
        },
      },
    });

    const { periodAggregates, requiredSources } = aggregateTransactionsByPeriod(
      transactions,
      periods,
      periodMode
    );

    const aggregate = periodAggregates[currentPeriod.key];
    const income = aggregate?.income.toNumber() || 0;
    const expense = aggregate?.expense.toNumber() || 0;
    const transactionCount = aggregate?.transactionCount || 0;
    const hasBankData = (aggregate?.bankCount || 0) > 0;
    const hasCreditData = (aggregate?.creditCount || 0) > 0;

    const totalDays = currentPeriod.endDate.startOf('day').diff(currentPeriod.startDate.startOf('day'), 'day') + 1;
    const elapsedDays = Math.max(
      0,
      Math.min(totalDays, now.startOf('day').diff(currentPeriod.startDate.startOf('day'), 'day') + 1)
    );
    const remainingDays = Math.max(0, currentPeriod.endDate.startOf('day').diff(now.startOf('day'), 'day'));
    const balance = income - expense;
    const averageDailyExpense = elapsedDays > 0 ? expense / elapsedDays : 0;

    const missingSources: string[] = [];
    if (requiredSources.requiresBank && !hasBankData) missingSources.push('עו"ש');
    if (requiredSources.requiresCredit && !hasCreditData) missingSources.push('אשראי');

    return {
      periodLabel: `${currentPeriod.label} ${currentPeriod.subLabel}`.trim(),
      dateRangeLabel: `${currentPeriod.startDate.format('DD/MM/YYYY')} - ${currentPeriod.endDate.format('DD/MM/YYYY')}`,
      income,
      expense,
      balance,
      averageDailyExpense,
      remainingDailyBudget: remainingDays > 0 ? balance / remainingDays : null,
      totalDays,
      elapsedDays,
      remainingDays,
      transactionCount,
      hasAnyData: transactionCount > 0 || income > 0 || expense > 0,
      expectsBankData: requiredSources.requiresBank,
      expectsCreditData: requiredSources.requiresCredit,
      hasBankData,
      hasCreditData,
      missingSources,
      isPartial: missingSources.length > 0,
    };
  } catch (error) {
    console.error('Dashboard current period status load error:', error);
    return buildFallbackCurrentPeriodStatus(periodMode);
  }
}

async function getCurrentActionItems(
  periodMode: PeriodMode,
  currentPeriodStatus: CurrentPeriodStatus,
  budgetStatus: VariableBudgetStatus
): Promise<CurrentActionItemsStatus> {
  const currentPeriod = buildPeriods(periodMode, dayjs(), 1)[0];
  if (!currentPeriod) {
    return buildFallbackCurrentActionItems(currentPeriodStatus, budgetStatus);
  }

  try {
    const recentWindowStart = dayjs().subtract(14, 'day').startOf('day').toDate();

    const [uncategorizedCount, failedUploadsCount] = await Promise.all([
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
            gte: recentWindowStart,
          },
        },
      }),
    ]);

    const items: CurrentActionItem[] = [];

    if (currentPeriodStatus.isPartial && currentPeriodStatus.missingSources.length > 0) {
      items.push({
        key: 'missing-sources',
        title: 'חסרים מקורות לתקופה הנוכחית',
        description: `חסרים ${currentPeriodStatus.missingSources.join(' ו־')} ולכן כדאי להשלים העלאה לפני שמחליטים`,
        href: '/upload',
        count: currentPeriodStatus.missingSources.length,
        tone: 'warning',
      });
    }

    if (uncategorizedCount > 0) {
      items.push({
        key: 'uncategorized',
        title: 'תנועות לא מסווגות',
        description: `יש ${uncategorizedCount} תנועות בתקופה הנוכחית שמחכות לשיוך לקטגוריה`,
        href: '/transactions?categoryId=uncategorized',
        count: uncategorizedCount,
        tone: 'warning',
      });
    }

    if (failedUploadsCount > 0) {
      items.push({
        key: 'failed-uploads',
        title: 'העלאות שנכשלו לאחרונה',
        description: `נמצאו ${failedUploadsCount} העלאות שנכשלו ב־14 הימים האחרונים וכדאי לבדוק אותן`,
        href: '/upload',
        count: failedUploadsCount,
        tone: 'danger',
      });
    }

    const budgetAlertsCount = budgetStatus.warningCount + budgetStatus.overCount;
    if (budgetAlertsCount > 0) {
      items.push({
        key: 'budget-alerts',
        title: 'התראות תקציב משתנות',
        description: `יש ${budgetAlertsCount} קטגוריות שמתקרבות לתקרה או כבר חרגו בתקופה הזו`,
        href: '/monthly-summary',
        count: budgetAlertsCount,
        tone: budgetStatus.overCount > 0 ? 'danger' : 'info',
      });
    }

    return {
      periodLabel: currentPeriodStatus.periodLabel,
      items,
      totalOpenItems: items.reduce((sum, item) => sum + item.count, 0),
    };
  } catch (error) {
    console.error('Dashboard current action items load error:', error);
    return buildFallbackCurrentActionItems(currentPeriodStatus, budgetStatus);
  }
}

async function getSmartNudgesStatus(
  periodMode: PeriodMode,
  currentPeriodStatus: CurrentPeriodStatus,
  budgetStatus: VariableBudgetStatus
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

    const [uncategorizedCount, failedUploadsCount, recentSuccessfulUploadsCount, latestSuccessfulUpload, recentPeriodIssues] = await Promise.all([
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
        actionLabel: daysSinceLastSuccessfulUpload === null ? 'העלה קובץ ראשון' : 'בדוק אם חסרה העלאה',
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
        priority: highUncategorizedPressure || uncategorizedConsecutivePeriods >= 2 ? 'high' : 'medium',
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
    console.error('Dashboard smart nudges load error:', error);
    return buildFallbackSmartNudgesStatus(
      periodKey,
      currentPeriodStatus,
      budgetStatus,
      snoozed,
      dismissed
    );
  }
}

async function getRecentTransactions(): Promise<RecentTransactionItem[]> {
  const transactions = await prisma.transaction.findMany({
    where: { isExcluded: false },
    select: {
      id: true,
      date: true,
      description: true,
      amount: true,
      category: {
        select: {
          name: true,
          icon: true,
          color: true,
        },
      },
    },
    orderBy: { date: 'desc' },
    take: 10
  });

  return transactions.map(tx => ({
    id: tx.id,
    date: tx.date.toISOString(),
    description: tx.description,
    amount: tx.amount.toString(),
    category: tx.category ? {
      name: tx.category.name,
      icon: tx.category.icon || '',
      color: tx.category.color || '#888'
    } : null
  }));
}

async function getCurrentVariableBudgetStatus(periodMode: PeriodMode): Promise<VariableBudgetStatus> {
  const now = dayjs();
  const currentPeriod = buildPeriods(periodMode, now, 1)[0];
  const periodKey = currentPeriod?.key || dayjs().format('YYYY-MM');
  const periodLabel = currentPeriod
    ? `${currentPeriod.label} ${currentPeriod.subLabel}`.trim()
    : periodKey;

  try {
    const plan = await getVariableBudgetPlan(periodMode, periodKey);
    const plannedEntries = Object.entries(plan.items || {});
    if (plannedEntries.length === 0) {
      return buildFallbackBudgetStatus(periodLabel, periodKey);
    }

    const plannedCategoryIds = plannedEntries.map(([categoryId]) => categoryId).filter(Boolean);
    if (plannedCategoryIds.length === 0) {
      return buildFallbackBudgetStatus(periodLabel, periodKey);
    }

    const [expensesInPeriod, categories] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          isExcluded: false,
          date: {
            gte: currentPeriod.startDate.startOf('day').toDate(),
            lte: currentPeriod.endDate.endOf('day').toDate(),
          },
          amount: { lt: 0 },
          categoryId: { in: plannedCategoryIds },
        },
        select: {
          categoryId: true,
          amount: true,
        },
      }),
      prisma.category.findMany({
        where: {
          id: { in: plannedCategoryIds },
        },
        select: {
          id: true,
          name: true,
          icon: true,
          color: true,
        },
      }),
    ]);

    const categoryById = new Map(categories.map((category) => [category.id, category]));
    const actualByCategory = new Map<string, number>();

    for (const tx of expensesInPeriod) {
      if (!tx.categoryId) continue;
      const current = actualByCategory.get(tx.categoryId) || 0;
      const numericAmount = Number(tx.amount);
      const amount = Number.isFinite(numericAmount) ? Math.abs(numericAmount) : 0;
      actualByCategory.set(tx.categoryId, current + amount);
    }

    let plannedTotal = 0;
    let actualTotal = 0;
    let warningCount = 0;
    let overCount = 0;
    const alerts: VariableBudgetAlert[] = [];

    for (const [categoryId, planned] of plannedEntries) {
      const actual = actualByCategory.get(categoryId) || 0;
      const utilization = planned > 0 ? (actual / planned) * 100 : 0;
      const remaining = planned - actual;
      const category = categoryById.get(categoryId);
      const severity: VariableBudgetAlert['severity'] | null = utilization >= 100
        ? 'over'
        : utilization >= 85
          ? 'warning'
          : null;

      plannedTotal += planned;
      actualTotal += actual;

      if (severity === 'over') overCount += 1;
      if (severity === 'warning') warningCount += 1;

      if (severity) {
        alerts.push({
          categoryId,
          categoryName: category?.name || 'קטגוריה',
          categoryIcon: category?.icon || '📁',
          categoryColor: category?.color || '#6B7280',
          planned,
          actual,
          remaining,
          utilizationPercent: utilization,
          severity,
        });
      }
    }

    alerts.sort((a, b) => {
      if (b.utilizationPercent !== a.utilizationPercent) {
        return b.utilizationPercent - a.utilizationPercent;
      }
      return b.actual - a.actual;
    });

    const remainingTotal = plannedTotal - actualTotal;
    const utilizationPercent = plannedTotal > 0 ? (actualTotal / plannedTotal) * 100 : 0;
    const totalDays = currentPeriod.endDate.startOf('day').diff(currentPeriod.startDate.startOf('day'), 'day') + 1;
    const elapsedDays = Math.max(
      0,
      Math.min(totalDays, now.startOf('day').diff(currentPeriod.startDate.startOf('day'), 'day') + 1)
    );
    const remainingDays = Math.max(0, currentPeriod.endDate.startOf('day').diff(now.startOf('day'), 'day'));
    const averageDailyActual = elapsedDays > 0 ? actualTotal / elapsedDays : 0;
    const projectedTotal = remainingDays > 0
      ? Number((actualTotal + averageDailyActual * remainingDays).toFixed(2))
      : actualTotal;
    const projectedRemaining = Number((plannedTotal - projectedTotal).toFixed(2));
    const projectedUtilizationPercent = plannedTotal > 0 ? (projectedTotal / plannedTotal) * 100 : 0;
    const plannedDailyAllowanceRemaining = remainingDays > 0
      ? Number((remainingTotal / remainingDays).toFixed(2))
      : null;
    const paceStatus: VariableBudgetStatus['paceStatus'] =
      projectedUtilizationPercent > 100
        ? 'over'
        : projectedUtilizationPercent >= 90
          ? 'warning'
          : 'on-track';

    return {
      hasPlan: true,
      periodKey,
      periodLabel,
      updatedAt: plan.updatedAt,
      plannedTotal,
      actualTotal,
      remainingTotal,
      utilizationPercent,
      projectedTotal,
      projectedRemaining,
      projectedUtilizationPercent,
      averageDailyActual,
      plannedDailyAllowanceRemaining,
      totalDays,
      elapsedDays,
      remainingDays,
      paceStatus,
      warningCount,
      overCount,
      alerts,
    };
  } catch (error) {
    console.error('Dashboard variable budget status error:', error);
    return buildFallbackBudgetStatus(periodLabel, periodKey);
  }
}

export default async function HomePage() {
  const periodMode = await getPeriodModeSetting();
  const currentPeriod = buildPeriods(periodMode, dayjs(), 1)[0];
  const fallbackPeriodKey = currentPeriod?.key || dayjs().format('YYYY-MM');
  const fallbackPeriodLabel = currentPeriod
    ? `${currentPeriod.label} ${currentPeriod.subLabel}`.trim()
    : fallbackPeriodKey;

  const [analyticsResult, recentTransactionsResult, budgetStatusResult, currentPeriodStatusResult] = await Promise.allSettled([
    getAnalyticsData(periodMode),
    getRecentTransactions(),
    getCurrentVariableBudgetStatus(periodMode),
    getCurrentPeriodStatus(periodMode),
  ]);

  const analytics = analyticsResult.status === 'fulfilled'
    ? analyticsResult.value
    : buildFallbackAnalytics(periodMode);
  if (analyticsResult.status === 'rejected') {
    console.error('Dashboard analytics load error:', analyticsResult.reason);
  }

  const recentTransactions = recentTransactionsResult.status === 'fulfilled'
    ? recentTransactionsResult.value
    : [];
  if (recentTransactionsResult.status === 'rejected') {
    console.error('Dashboard recent transactions load error:', recentTransactionsResult.reason);
  }

  const budgetStatus = budgetStatusResult.status === 'fulfilled'
    ? budgetStatusResult.value
    : buildFallbackBudgetStatus(fallbackPeriodLabel, fallbackPeriodKey);
  if (budgetStatusResult.status === 'rejected') {
    console.error('Dashboard budget status load error:', budgetStatusResult.reason);
  }

  const currentPeriodStatus = currentPeriodStatusResult.status === 'fulfilled'
    ? currentPeriodStatusResult.value
    : buildFallbackCurrentPeriodStatus(periodMode);
  if (currentPeriodStatusResult.status === 'rejected') {
    console.error('Dashboard current period status load error:', currentPeriodStatusResult.reason);
  }

  const currentActionItems = await getCurrentActionItems(periodMode, currentPeriodStatus, budgetStatus);
  const smartNudges = await getSmartNudgesStatus(periodMode, currentPeriodStatus, budgetStatus);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">לוח בקרה</h1>
        <div className="text-sm text-gray-500 text-left">
          <p>{dayjs().format('DD/MM/YYYY')}</p>
          <p>
            ממוצע לפי {analytics.periodsUsedForAverageCount} {periodMode === 'billing' ? 'מחזורים' : 'חודשים'} ({analytics.periodLabel})
            {analytics.incompletePeriodsWithDataCount > 0 && ` · ${analytics.incompletePeriodsWithDataCount} תקופות חלקיות לא נכללו`}
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <SummaryCard
          title="ממוצע הכנסות חודשי"
          value={analytics.averageMonthlyIncome}
          type="income"
        />
        <SummaryCard
          title="ממוצע הוצאות חודשי"
          value={analytics.averageMonthlyExpense}
          type="expense"
        />
        <div className="hidden sm:block">
          <SummaryCard
            title="ממוצע יתרה חודשית"
            value={analytics.averageMonthlyBalance}
            type="balance"
          />
        </div>
        <div className="hidden sm:block">
          <SummaryCard
            title="ממוצע חיסכון חודשי"
            value={analytics.averageMonthlySavings}
            type="savings"
          />
        </div>
      </div>

      <CurrentPeriodStatusCard status={currentPeriodStatus} />

      <SmartNudgesCard status={smartNudges} />

      <CurrentActionItemsCard status={currentActionItems} />

      <VariableBudgetStatusCard status={budgetStatus} />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <ExpenseChart data={analytics.monthlyTrends} />
        <CategoryPieChart
          data={analytics.categoryBreakdown}
          averageIncome={analytics.averageMonthlyIncome}
        />
      </div>

      {/* Recent Transactions */}
      <RecentTransactions transactions={recentTransactions} />
    </div>
  );
}
