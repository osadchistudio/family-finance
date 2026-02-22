import { prisma } from '@/lib/prisma';
import { SummaryCard } from '@/components/dashboard/SummaryCard';
import { ExpenseChart } from '@/components/dashboard/ExpenseChart';
import { CategoryPieChart } from '@/components/dashboard/CategoryPieChart';
import { RecentTransactions } from '@/components/dashboard/RecentTransactions';
import dayjs from 'dayjs';
import { Decimal } from 'decimal.js';
import { buildPeriodLabels, buildPeriods, PeriodMode } from '@/lib/period-utils';
import { getPeriodModeSetting } from '@/lib/system-settings';
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

export default async function HomePage() {
  const periodMode = await getPeriodModeSetting();
  const analytics = await getAnalyticsData(periodMode);
  const recentTransactions = await getRecentTransactions();

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
