import { prisma } from '@/lib/prisma';
import { SummaryCard } from '@/components/dashboard/SummaryCard';
import { ExpenseChart } from '@/components/dashboard/ExpenseChart';
import { CategoryPieChart } from '@/components/dashboard/CategoryPieChart';
import { RecentTransactions } from '@/components/dashboard/RecentTransactions';
import dayjs from 'dayjs';
import { Decimal } from 'decimal.js';

async function getAnalyticsData() {
  const months = 6;
  const startDate = dayjs().subtract(months, 'month').startOf('month').toDate();
  const endDate = dayjs().endOf('month').toDate();

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

  for (const tx of transactions) {
    const monthKey = dayjs(tx.date).format('YYYY-MM');
    const amount = new Decimal(tx.amount.toString());

    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = { income: new Decimal(0), expense: new Decimal(0) };
    }

    if (amount.greaterThan(0)) {
      monthlyData[monthKey].income = monthlyData[monthKey].income.plus(amount);
    } else {
      monthlyData[monthKey].expense = monthlyData[monthKey].expense.plus(amount.abs());
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

  // Current month stats
  const currentMonth = dayjs().format('YYYY-MM');
  const currentMonthData = monthlyData[currentMonth] || { income: new Decimal(0), expense: new Decimal(0) };

  // Monthly trends
  const monthlyTrends = [];
  const hebrewMonths = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

  for (let i = months - 1; i >= 0; i--) {
    const month = dayjs().subtract(i, 'month');
    const key = month.format('YYYY-MM');
    const data = monthlyData[key] || { income: new Decimal(0), expense: new Decimal(0) };
    monthlyTrends.push({
      month: month.format('MM/YYYY'),
      monthHebrew: hebrewMonths[month.month()],
      income: data.income.toNumber(),
      expense: data.expense.toNumber(),
      balance: data.income.minus(data.expense).toNumber()
    });
  }

  // Category breakdown
  const categoryBreakdown = Object.values(categoryTotals)
    .map(cat => ({
      name: cat.name,
      value: cat.total.toNumber(),
      color: cat.color,
      icon: cat.icon
    }))
    .sort((a, b) => b.value - a.value);

  return {
    currentMonthIncome: currentMonthData.income.toNumber(),
    currentMonthExpense: currentMonthData.expense.toNumber(),
    currentMonthBalance: currentMonthData.income.minus(currentMonthData.expense).toNumber(),
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
  const analytics = await getAnalyticsData();
  const recentTransactions = await getRecentTransactions();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">לוח בקרה</h1>
        <p className="text-sm text-gray-500">
          {dayjs().format('DD/MM/YYYY')}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="הכנסות החודש"
          value={analytics.currentMonthIncome}
          type="income"
        />
        <SummaryCard
          title="הוצאות החודש"
          value={analytics.currentMonthExpense}
          type="expense"
        />
        <SummaryCard
          title="יתרה החודש"
          value={analytics.currentMonthBalance}
          type="balance"
        />
        <SummaryCard
          title="חיסכון"
          value={Math.max(0, analytics.currentMonthBalance)}
          type="savings"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExpenseChart data={analytics.monthlyTrends} />
        <CategoryPieChart data={analytics.categoryBreakdown} />
      </div>

      {/* Recent Transactions */}
      <RecentTransactions transactions={recentTransactions} />
    </div>
  );
}
