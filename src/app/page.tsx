import { prisma } from '@/lib/prisma';
import { SummaryCard } from '@/components/dashboard/SummaryCard';
import { ExpenseChart } from '@/components/dashboard/ExpenseChart';
import { CategoryPieChart } from '@/components/dashboard/CategoryPieChart';
import { CategoryAveragesList } from '@/components/dashboard/CategoryAveragesList';
import { RecentTransactions } from '@/components/dashboard/RecentTransactions';
import dayjs from 'dayjs';
import { Decimal } from 'decimal.js';
import { buildPeriodLabels, buildPeriods, getPeriodKey, isBankInstitution, isCreditInstitution, PeriodMode } from '@/lib/period-utils';
import { getPeriodModeSetting } from '@/lib/system-settings';

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
    include: { category: true, account: true }
  });

  // Calculate monthly totals
  const monthlyData: Record<string, { income: Decimal; expense: Decimal; bankCount: number; creditCount: number }> = {};
  const categoryTotalsByPeriod: Record<string, { name: string; color: string; icon: string; totals: Record<string, Decimal> }> = {};

  for (const period of periods) {
    monthlyData[period.key] = { income: new Decimal(0), expense: new Decimal(0), bankCount: 0, creditCount: 0 };
  }

  for (const tx of transactions) {
    const monthKey = getPeriodKey(dayjs(tx.date), periodMode);
    const amount = new Decimal(tx.amount.toString());
    if (!monthlyData[monthKey]) continue;

    if (amount.greaterThan(0)) {
      monthlyData[monthKey].income = monthlyData[monthKey].income.plus(amount);
    } else {
      monthlyData[monthKey].expense = monthlyData[monthKey].expense.plus(amount.abs());
    }

    if (isBankInstitution(tx.account?.institution)) {
      monthlyData[monthKey].bankCount++;
    }
    if (isCreditInstitution(tx.account?.institution)) {
      monthlyData[monthKey].creditCount++;
    }

    if (tx.category && amount.lessThan(0)) {
      if (!categoryTotalsByPeriod[tx.category.id]) {
        categoryTotalsByPeriod[tx.category.id] = {
          name: tx.category.name,
          color: tx.category.color || '#888888',
          icon: tx.category.icon || '',
          totals: {},
        };
      }
      if (!categoryTotalsByPeriod[tx.category.id].totals[monthKey]) {
        categoryTotalsByPeriod[tx.category.id].totals[monthKey] = new Decimal(0);
      }
      categoryTotalsByPeriod[tx.category.id].totals[monthKey] = categoryTotalsByPeriod[tx.category.id].totals[monthKey].plus(amount.abs());
    }
  }

  const requiresBank = transactions.some((tx) => isBankInstitution(tx.account?.institution));
  const requiresCredit = transactions.some((tx) => isCreditInstitution(tx.account?.institution));
  const periodEntries = Object.entries(monthlyData);
  const periodKeysWithData = periodEntries
    .filter(([, entry]) => entry.income.greaterThan(0) || entry.expense.greaterThan(0))
    .map(([key]) => key);
  const completePeriodKeys = periodEntries
    .filter(([, entry]) => (entry.income.greaterThan(0) || entry.expense.greaterThan(0)))
    .filter(([, entry]) => (!requiresBank || entry.bankCount > 0) && (!requiresCredit || entry.creditCount > 0))
    .map(([key]) => key);
  const periodsUsedForAverage = completePeriodKeys.length > 0 ? completePeriodKeys : periodKeysWithData;
  const periodsForAverageCount = Math.max(periodsUsedForAverage.length, 1);

  // Monthly trends
  const monthlyTrends = periods.map((period) => {
    const data = monthlyData[period.key] || { income: new Decimal(0), expense: new Decimal(0), bankCount: 0, creditCount: 0 };
    return {
      month: period.key,
      monthHebrew: period.chartLabel,
      income: data.income.toNumber(),
      expense: data.expense.toNumber(),
      balance: data.income.minus(data.expense).toNumber(),
    };
  });

  // Category breakdown
  const categoryBreakdown = Object.values(categoryTotalsByPeriod)
    .map((category) => {
      const totalInCompletePeriods = periodsUsedForAverage.reduce(
        (sum, periodKey) => sum.plus(category.totals[periodKey] || 0),
        new Decimal(0)
      );
      return {
        name: category.name,
        value: totalInCompletePeriods.div(periodsForAverageCount).toNumber(),
        color: category.color,
        icon: category.icon
      };
    })
    .filter((category) => category.value > 0)
    .sort((a, b) => b.value - a.value);

  const totalIncome = periodsUsedForAverage.reduce((sum, key) => sum.plus(monthlyData[key].income), new Decimal(0));
  const totalExpense = periodsUsedForAverage.reduce((sum, key) => sum.plus(monthlyData[key].expense), new Decimal(0));
  const averageMonthlyIncome = totalIncome.div(periodsForAverageCount).toNumber();
  const averageMonthlyExpense = totalExpense.div(periodsForAverageCount).toNumber();
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
    include: { category: true },
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
    <div className="space-y-6">
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
        <SummaryCard
          title="ממוצע יתרה חודשית"
          value={analytics.averageMonthlyBalance}
          type="balance"
        />
        <SummaryCard
          title="ממוצע חיסכון חודשי"
          value={analytics.averageMonthlySavings}
          type="savings"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExpenseChart data={analytics.monthlyTrends} />
        <CategoryPieChart data={analytics.categoryBreakdown} />
      </div>

      <CategoryAveragesList data={analytics.categoryBreakdown} />

      {/* Recent Transactions */}
      <RecentTransactions transactions={recentTransactions} />
    </div>
  );
}
