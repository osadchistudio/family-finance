import { prisma } from '@/lib/prisma';
import { SummaryCard } from '@/components/dashboard/SummaryCard';
import { ExpenseChart } from '@/components/dashboard/ExpenseChart';
import { CategoryPieChart } from '@/components/dashboard/CategoryPieChart';
import { RecentTransactions } from '@/components/dashboard/RecentTransactions';
import {
  VariableBudgetAlert,
  VariableBudgetStatus,
  VariableBudgetStatusCard,
} from '@/components/dashboard/VariableBudgetStatusCard';
import dayjs from 'dayjs';
import { Decimal } from 'decimal.js';
import { buildPeriodLabels, buildPeriods, PeriodMode } from '@/lib/period-utils';
import { getPeriodModeSetting } from '@/lib/system-settings';
import { getVariableBudgetPlan } from '@/lib/variable-budget';
import {
  aggregateTransactionsByPeriod,
  buildAverageCategoryBreakdown,
  buildMonthlyTrends,
  selectPeriodsForAverages,
} from '@/lib/analytics';

export const dynamic = 'force-dynamic';

async function getAnalyticsData(periodMode: PeriodMode) {
  const months = 6;
  const periods = buildPeriods(periodMode, dayjs(), months);
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

async function getRecentTransactions() {
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
  const currentPeriod = buildPeriods(periodMode, dayjs(), 1)[0];
  const periodKey = currentPeriod.key;
  const periodLabel = `${currentPeriod.label} ${currentPeriod.subLabel}`.trim();

  const plan = await getVariableBudgetPlan(periodMode, periodKey);
  const plannedEntries = Object.entries(plan.items || {});
  if (plannedEntries.length === 0) {
    return {
      hasPlan: false,
      periodKey,
      periodLabel,
      updatedAt: '',
      plannedTotal: 0,
      actualTotal: 0,
      remainingTotal: 0,
      utilizationPercent: 0,
      warningCount: 0,
      overCount: 0,
      alerts: [],
    };
  }

  const plannedCategoryIds = plannedEntries.map(([categoryId]) => categoryId);

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
    const amount = Math.abs(Number(tx.amount));
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

  return {
    hasPlan: true,
    periodKey,
    periodLabel,
    updatedAt: plan.updatedAt,
    plannedTotal,
    actualTotal,
    remainingTotal,
    utilizationPercent,
    warningCount,
    overCount,
    alerts,
  };
}

export default async function HomePage() {
  const periodMode = await getPeriodModeSetting();
  const [analytics, recentTransactions, budgetStatus] = await Promise.all([
    getAnalyticsData(periodMode),
    getRecentTransactions(),
    getCurrentVariableBudgetStatus(periodMode),
  ]);

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
