import { prisma } from '@/lib/prisma';
import { SummaryCard } from '@/components/dashboard/SummaryCard';
import { ExpenseChart } from '@/components/dashboard/ExpenseChart';
import { CategoryPieChart } from '@/components/dashboard/CategoryPieChart';
import { CategoryAveragesList } from '@/components/dashboard/CategoryAveragesList';
import { RecentTransactions } from '@/components/dashboard/RecentTransactions';
import dayjs from 'dayjs';
import { Decimal } from 'decimal.js';
import { buildPeriodLabels, buildPeriods, getPeriodKey, PeriodMode } from '@/lib/period-utils';
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
    include: { category: true }
  });

  // Calculate monthly totals
  const monthlyData: Record<string, { income: Decimal; expense: Decimal }> = {};
  const categoryTotals: Record<string, { name: string; total: Decimal; color: string; icon: string }> = {};
  let totalIncome = new Decimal(0);
  let totalExpense = new Decimal(0);

  for (const period of periods) {
    monthlyData[period.key] = { income: new Decimal(0), expense: new Decimal(0) };
  }

  for (const tx of transactions) {
    const monthKey = getPeriodKey(dayjs(tx.date), periodMode);
    const amount = new Decimal(tx.amount.toString());
    if (!monthlyData[monthKey]) continue;

    if (amount.greaterThan(0)) {
      monthlyData[monthKey].income = monthlyData[monthKey].income.plus(amount);
      totalIncome = totalIncome.plus(amount);
    } else {
      monthlyData[monthKey].expense = monthlyData[monthKey].expense.plus(amount.abs());
      totalExpense = totalExpense.plus(amount.abs());
    }

    if (tx.category && amount.lessThan(0)) {
      if (!categoryTotals[tx.category.id]) {
        categoryTotals[tx.category.id] = {
          name: tx.category.name,
          total: new Decimal(0),
          color: tx.category.color || '#888888',
          icon: tx.category.icon || ''
        };
      }
      categoryTotals[tx.category.id].total = categoryTotals[tx.category.id].total.plus(amount.abs());
    }
  }

  // Use only months that actually have transactions to avoid skewed averages.
  const monthsWithData = Math.max(
    1,
    Object.values(monthlyData).filter((entry) => entry.income.greaterThan(0) || entry.expense.greaterThan(0)).length
  );

  // Monthly trends
  const monthlyTrends = periods.map((period) => {
    const data = monthlyData[period.key] || { income: new Decimal(0), expense: new Decimal(0) };
    return {
      month: period.key,
      monthHebrew: period.chartLabel,
      income: data.income.toNumber(),
      expense: data.expense.toNumber(),
      balance: data.income.minus(data.expense).toNumber(),
    };
  });

  // Category breakdown
  const categoryBreakdown = Object.values(categoryTotals)
    .map(cat => ({
      name: cat.name,
      value: cat.total.div(monthsWithData).toNumber(),
      color: cat.color,
      icon: cat.icon
    }))
    .sort((a, b) => b.value - a.value);

  const averageMonthlyIncome = totalIncome.div(monthsWithData).toNumber();
  const averageMonthlyExpense = totalExpense.div(monthsWithData).toNumber();
  const averageMonthlyBalance = averageMonthlyIncome - averageMonthlyExpense;

  return {
    averageMonthlyIncome,
    averageMonthlyExpense,
    averageMonthlyBalance,
    averageMonthlySavings: Math.max(0, averageMonthlyBalance),
    monthsWithData,
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
          <p>ממוצע לפי {analytics.monthsWithData} {periodMode === 'billing' ? 'מחזורים' : 'חודשים'} ({analytics.periodLabel})</p>
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
