import { prisma } from '@/lib/prisma';
import { MonthlySummaryView } from '@/components/monthly-summary/MonthlySummaryView';
import dayjs from 'dayjs';
import { Decimal } from 'decimal.js';

interface MonthAggregate {
  income: Decimal;
  expense: Decimal;
  transactionCount: number;
  categories: Record<string, {
    name: string;
    icon: string;
    color: string;
    total: Decimal;
  }>;
}

async function getMonthlySummaryData() {
  // Fetch last 12 months of transactions
  const startDate = dayjs().subtract(11, 'month').startOf('month').toDate();
  const endDate = dayjs().endOf('month').toDate();

  const transactions = await prisma.transaction.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
      isExcluded: false,
    },
    include: { category: true },
    orderBy: { date: 'desc' },
  });

  // Group by YYYY-MM
  const monthMap: Record<string, MonthAggregate> = {};

  // Initialize all 12 months (even empty ones)
  for (let i = 11; i >= 0; i--) {
    const key = dayjs().subtract(i, 'month').format('YYYY-MM');
    monthMap[key] = {
      income: new Decimal(0),
      expense: new Decimal(0),
      transactionCount: 0,
      categories: {},
    };
  }

  // Aggregate
  for (const tx of transactions) {
    const monthKey = dayjs(tx.date).format('YYYY-MM');
    if (!monthMap[monthKey]) continue;

    const amount = new Decimal(tx.amount.toString());
    monthMap[monthKey].transactionCount++;

    if (amount.greaterThan(0)) {
      monthMap[monthKey].income = monthMap[monthKey].income.plus(amount);
    } else {
      monthMap[monthKey].expense = monthMap[monthKey].expense.plus(amount.abs());
    }

    // Category breakdown (expenses only)
    if (tx.category && amount.lessThan(0)) {
      const catId = tx.category.id;
      if (!monthMap[monthKey].categories[catId]) {
        monthMap[monthKey].categories[catId] = {
          name: tx.category.name,
          icon: tx.category.icon || '',
          color: tx.category.color || '#888888',
          total: new Decimal(0),
        };
      }
      monthMap[monthKey].categories[catId].total = monthMap[monthKey].categories[catId].total.plus(amount.abs());
    }
  }

  // Convert to serializable format
  const months = Object.entries(monthMap)
    .sort(([a], [b]) => b.localeCompare(a)) // newest first for the grid
    .map(([monthKey, agg]) => {
      const topCategories = Object.values(agg.categories)
        .map(c => ({
          name: c.name,
          icon: c.icon,
          color: c.color,
          total: c.total.toNumber(),
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

      return {
        monthKey,
        income: agg.income.toNumber(),
        expense: agg.expense.toNumber(),
        balance: agg.income.minus(agg.expense).toNumber(),
        transactionCount: agg.transactionCount,
        topCategories,
      };
    });

  // Category breakdowns per month (for drill-down)
  const categoryBreakdowns: Record<string, { name: string; value: number; color: string; icon: string }[]> = {};

  for (const [monthKey, agg] of Object.entries(monthMap)) {
    categoryBreakdowns[monthKey] = Object.values(agg.categories)
      .map(c => ({
        name: c.name,
        value: c.total.toNumber(),
        color: c.color,
        icon: c.icon,
      }))
      .sort((a, b) => b.value - a.value);
  }

  return { months, categoryBreakdowns };
}

export default async function MonthlySummaryPage() {
  const { months, categoryBreakdowns } = await getMonthlySummaryData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">סיכום חודשי</h1>
        <p className="text-gray-600 mt-1">מעקב תזרים מזומנים לפי חודשים</p>
      </div>

      <MonthlySummaryView
        months={months}
        categoryBreakdowns={categoryBreakdowns}
      />
    </div>
  );
}
