import dayjs from 'dayjs';
import { prisma } from '@/lib/prisma';
import { aggregateTransactionsByPeriod } from '@/lib/analytics';
import { buildPeriods, type PeriodMode, RECENT_AVERAGE_PERIODS } from '@/lib/period-utils';
import { getPeriodModeSetting } from '@/lib/system-settings';
import { getVariableBudgetPlan } from '@/lib/variable-budget';

export interface CurrentPeriodBudgetAlert {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  planned: number;
  actual: number;
  remaining: number;
  utilizationPercent: number;
  severity: 'warning' | 'over';
}

export interface CurrentPeriodBudgetStatus {
  hasPlan: boolean;
  periodKey: string;
  periodLabel: string;
  updatedAt: string;
  plannedTotal: number;
  actualTotal: number;
  remainingTotal: number;
  utilizationPercent: number;
  projectedTotal: number;
  projectedRemaining: number;
  projectedUtilizationPercent: number;
  averageDailyActual: number;
  plannedDailyAllowanceRemaining: number | null;
  totalDays: number;
  elapsedDays: number;
  remainingDays: number;
  paceStatus: 'on-track' | 'warning' | 'over';
  warningCount: number;
  overCount: number;
  alerts: CurrentPeriodBudgetAlert[];
}

export interface CurrentPeriodUncategorizedPreviewItem {
  id: string;
  date: string;
  description: string;
  amount: number;
}

export interface CurrentPeriodInsights {
  periodMode: PeriodMode;
  periodKey: string;
  periodLabel: string;
  dateRangeLabel: string;
  income: number;
  expense: number;
  balance: number;
  averageDailyExpense: number;
  remainingDailyBudget: number | null;
  totalDays: number;
  elapsedDays: number;
  remainingDays: number;
  transactionCount: number;
  hasAnyData: boolean;
  expectsBankData: boolean;
  expectsCreditData: boolean;
  hasBankData: boolean;
  hasCreditData: boolean;
  missingSources: string[];
  isPartial: boolean;
  uncategorizedCount: number;
  uncategorizedPreview: CurrentPeriodUncategorizedPreviewItem[];
  recentUploadsLast7Days: number;
  budgetStatus: CurrentPeriodBudgetStatus;
}

const UNCATEGORIZED_PREVIEW_LIMIT = 5;

function buildFallbackBudgetStatus(periodLabel: string, periodKey: string): CurrentPeriodBudgetStatus {
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

async function getCurrentVariableBudgetStatus(
  periodMode: PeriodMode
): Promise<CurrentPeriodBudgetStatus> {
  const now = dayjs();
  const currentPeriod = buildPeriods(periodMode, now, 1)[0];
  const periodKey = currentPeriod?.key || dayjs().format('YYYY-MM');
  const periodLabel = currentPeriod
    ? `${currentPeriod.label} ${currentPeriod.subLabel}`.trim()
    : periodKey;

  if (!currentPeriod) {
    return buildFallbackBudgetStatus(periodLabel, periodKey);
  }

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
    const alerts: CurrentPeriodBudgetAlert[] = [];

    for (const [categoryId, planned] of plannedEntries) {
      const actual = actualByCategory.get(categoryId) || 0;
      const utilization = planned > 0 ? (actual / planned) * 100 : 0;
      const remaining = planned - actual;
      const category = categoryById.get(categoryId);
      const severity: CurrentPeriodBudgetAlert['severity'] | null = utilization >= 100
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

    alerts.sort((left, right) => {
      if (right.utilizationPercent !== left.utilizationPercent) {
        return right.utilizationPercent - left.utilizationPercent;
      }
      return right.actual - left.actual;
    });

    const remainingTotal = plannedTotal - actualTotal;
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
    const utilizationPercent = plannedTotal > 0 ? (actualTotal / plannedTotal) * 100 : 0;
    const projectedUtilizationPercent = plannedTotal > 0 ? (projectedTotal / plannedTotal) * 100 : 0;
    const plannedDailyAllowanceRemaining = remainingDays > 0
      ? Number((remainingTotal / remainingDays).toFixed(2))
      : null;
    const paceStatus: CurrentPeriodBudgetStatus['paceStatus'] =
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
    console.error('Current period insights variable budget load error:', error);
    return buildFallbackBudgetStatus(periodLabel, periodKey);
  }
}

export async function getCurrentPeriodInsights(): Promise<CurrentPeriodInsights> {
  const periodMode = await getPeriodModeSetting();
  const now = dayjs();
  const periods = buildPeriods(periodMode, now, RECENT_AVERAGE_PERIODS);
  const currentPeriod = periods[periods.length - 1];

  if (!currentPeriod) {
    const fallbackPeriodKey = now.format('YYYY-MM');
    const fallbackPeriodLabel = fallbackPeriodKey;
    return {
      periodMode,
      periodKey: fallbackPeriodKey,
      periodLabel: fallbackPeriodLabel,
      dateRangeLabel: now.format('DD/MM/YYYY'),
      income: 0,
      expense: 0,
      balance: 0,
      averageDailyExpense: 0,
      remainingDailyBudget: null,
      totalDays: 0,
      elapsedDays: 0,
      remainingDays: 0,
      transactionCount: 0,
      hasAnyData: false,
      expectsBankData: false,
      expectsCreditData: false,
      hasBankData: false,
      hasCreditData: false,
      missingSources: [],
      isPartial: false,
      uncategorizedCount: 0,
      uncategorizedPreview: [],
      recentUploadsLast7Days: 0,
      budgetStatus: buildFallbackBudgetStatus(fallbackPeriodLabel, fallbackPeriodKey),
    };
  }

  try {
    const periodStart = currentPeriod.startDate.startOf('day').toDate();
    const periodEnd = currentPeriod.endDate.endOf('day').toDate();

    const [transactions, uncategorizedCount, uncategorizedPreviewRows, recentUploadsLast7Days, budgetStatus] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          date: {
            gte: periods[0].startDate.startOf('day').toDate(),
            lte: periodEnd,
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
      }),
      prisma.transaction.count({
        where: {
          isExcluded: false,
          categoryId: null,
          date: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
      }),
      prisma.transaction.findMany({
        where: {
          isExcluded: false,
          categoryId: null,
          date: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
        select: {
          id: true,
          date: true,
          description: true,
          amount: true,
        },
        orderBy: [
          { date: 'desc' },
          { createdAt: 'desc' },
        ],
        take: UNCATEGORIZED_PREVIEW_LIMIT,
      }),
      prisma.fileUpload.count({
        where: {
          processedAt: {
            gte: dayjs().subtract(7, 'day').toDate(),
          },
        },
      }),
      getCurrentVariableBudgetStatus(periodMode),
    ]);

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
      periodMode,
      periodKey: currentPeriod.key,
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
      uncategorizedCount,
      uncategorizedPreview: uncategorizedPreviewRows.map((tx) => ({
        id: tx.id,
        date: tx.date.toISOString(),
        description: tx.description,
        amount: Number(tx.amount),
      })),
      recentUploadsLast7Days,
      budgetStatus,
    };
  } catch (error) {
    console.error('Current period insights load error:', error);
    const fallbackPeriodKey = currentPeriod.key;
    const fallbackPeriodLabel = `${currentPeriod.label} ${currentPeriod.subLabel}`.trim();
    return {
      periodMode,
      periodKey: fallbackPeriodKey,
      periodLabel: fallbackPeriodLabel,
      dateRangeLabel: `${currentPeriod.startDate.format('DD/MM/YYYY')} - ${currentPeriod.endDate.format('DD/MM/YYYY')}`,
      income: 0,
      expense: 0,
      balance: 0,
      averageDailyExpense: 0,
      remainingDailyBudget: null,
      totalDays: currentPeriod.endDate.startOf('day').diff(currentPeriod.startDate.startOf('day'), 'day') + 1,
      elapsedDays: 0,
      remainingDays: currentPeriod.endDate.startOf('day').diff(now.startOf('day'), 'day'),
      transactionCount: 0,
      hasAnyData: false,
      expectsBankData: false,
      expectsCreditData: false,
      hasBankData: false,
      hasCreditData: false,
      missingSources: [],
      isPartial: false,
      uncategorizedCount: 0,
      uncategorizedPreview: [],
      recentUploadsLast7Days: 0,
      budgetStatus: buildFallbackBudgetStatus(fallbackPeriodLabel, fallbackPeriodKey),
    };
  }
}
