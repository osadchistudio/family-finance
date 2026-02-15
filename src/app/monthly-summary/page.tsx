import { Prisma } from '@prisma/client';
import { Decimal } from 'decimal.js';
import dayjs from 'dayjs';
import { prisma } from '@/lib/prisma';
import { getPeriodModeSetting } from '@/lib/system-settings';
import { PeriodMode, PeriodDefinition, buildPeriodLabels, buildPeriods, getPeriodKey } from '@/lib/period-utils';
import { MonthlySummaryView } from '@/components/monthly-summary/MonthlySummaryView';

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

interface MonthlyDataset {
  months: {
    monthKey: string;
    label: string;
    subLabel: string;
    chartLabel: string;
    periodStart: string;
    periodEnd: string;
    isCurrentPeriod: boolean;
    income: number;
    expense: number;
    balance: number;
    transactionCount: number;
    topCategories: { name: string; icon: string; color: string; total: number }[];
  }[];
  categoryBreakdowns: Record<string, { id: string; name: string; value: number; color: string; icon: string }[]>;
  categoryOptions: { id: string; name: string; icon: string; color: string }[];
}

type TransactionWithCategory = Prisma.TransactionGetPayload<{ include: { category: true } }>;

function buildDataset(
  transactions: TransactionWithCategory[],
  periodMode: PeriodMode,
  periods: PeriodDefinition[]
): MonthlyDataset {
  const monthMap: Record<string, MonthAggregate> = {};
  for (const period of periods) {
    monthMap[period.key] = {
      income: new Decimal(0),
      expense: new Decimal(0),
      transactionCount: 0,
      categories: {},
    };
  }

  for (const tx of transactions) {
    const periodKey = getPeriodKey(dayjs(tx.date), periodMode);
    if (!monthMap[periodKey]) continue;

    const amount = new Decimal(tx.amount.toString());
    monthMap[periodKey].transactionCount++;

    if (amount.greaterThan(0)) {
      monthMap[periodKey].income = monthMap[periodKey].income.plus(amount);
    } else {
      monthMap[periodKey].expense = monthMap[periodKey].expense.plus(amount.abs());
    }

    if (tx.category && amount.lessThan(0)) {
      const categoryId = tx.category.id;
      if (!monthMap[periodKey].categories[categoryId]) {
        monthMap[periodKey].categories[categoryId] = {
          name: tx.category.name,
          icon: tx.category.icon || '',
          color: tx.category.color || '#888888',
          total: new Decimal(0),
        };
      }
      monthMap[periodKey].categories[categoryId].total = monthMap[periodKey].categories[categoryId].total.plus(amount.abs());
    }
  }

  const months = [...periods]
    .reverse()
    .map((period) => {
      const aggregate = monthMap[period.key];
      const topCategories = Object.values(aggregate.categories)
        .map((category) => ({
          name: category.name,
          icon: category.icon,
          color: category.color,
          total: category.total.toNumber(),
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

      return {
        monthKey: period.key,
        label: period.label,
        subLabel: period.subLabel,
        chartLabel: period.chartLabel,
        periodStart: period.startDate.format('YYYY-MM-DD'),
        periodEnd: period.endDate.format('YYYY-MM-DD'),
        isCurrentPeriod: period.isCurrent,
        income: aggregate.income.toNumber(),
        expense: aggregate.expense.toNumber(),
        balance: aggregate.income.minus(aggregate.expense).toNumber(),
        transactionCount: aggregate.transactionCount,
        topCategories,
      };
    });

  const categoryBreakdowns: Record<string, { id: string; name: string; value: number; color: string; icon: string }[]> = {};
  const categoryOptionsMap: Record<string, { id: string; name: string; icon: string; color: string }> = {};

  for (const period of periods) {
    const aggregate = monthMap[period.key];
    categoryBreakdowns[period.key] = Object.entries(aggregate.categories)
      .map(([categoryId, category]) => ({
        id: categoryId,
        name: category.name,
        value: category.total.toNumber(),
        color: category.color,
        icon: category.icon,
      }))
      .sort((a, b) => b.value - a.value);

    for (const [categoryId, category] of Object.entries(aggregate.categories)) {
      if (!categoryOptionsMap[categoryId]) {
        categoryOptionsMap[categoryId] = {
          id: categoryId,
          name: category.name,
          icon: category.icon,
          color: category.color,
        };
      }
    }
  }

  return {
    months,
    categoryBreakdowns,
    categoryOptions: Object.values(categoryOptionsMap).sort((a, b) => a.name.localeCompare(b.name, 'he')),
  };
}

async function getMonthlySummaryData(periodMode: PeriodMode) {
  const now = dayjs();
  const periods = buildPeriods(periodMode, now, 12);
  const minStart = periods[0].startDate.startOf('day');
  const maxEnd = periods[periods.length - 1].endDate.endOf('day');

  const transactions = await prisma.transaction.findMany({
    where: {
      date: { gte: minStart.toDate(), lte: maxEnd.toDate() },
      isExcluded: false,
    },
    include: { category: true },
    orderBy: { date: 'desc' },
  });

  return buildDataset(transactions, periodMode, periods);
}

export default async function MonthlySummaryPage() {
  const periodMode = await getPeriodModeSetting();
  const data = await getMonthlySummaryData(periodMode);
  const labels = buildPeriodLabels(periodMode);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">סיכום חודשי</h1>
        <p className="text-gray-600 mt-1">מעקב תזרים מזומנים לפי {labels.short}</p>
      </div>

      <MonthlySummaryView
        months={data.months}
        categoryBreakdowns={data.categoryBreakdowns}
        categoryOptions={data.categoryOptions}
        periodMode={periodMode}
      />
    </div>
  );
}
