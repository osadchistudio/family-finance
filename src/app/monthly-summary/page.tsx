import { prisma } from '@/lib/prisma';
import { getHebrewMonthName } from '@/lib/formatters';
import { MonthlySummaryView } from '@/components/monthly-summary/MonthlySummaryView';
import dayjs, { Dayjs } from 'dayjs';
import { Decimal } from 'decimal.js';
import { Prisma } from '@prisma/client';

type PeriodMode = 'calendar' | 'billing';

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

interface PeriodDefinition {
  key: string;
  label: string;
  subLabel: string;
  chartLabel: string;
  startDate: Dayjs;
  endDate: Dayjs;
  isCurrent: boolean;
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

function getCurrentBillingCycleStart(referenceDate: Dayjs) {
  const cutoffDay = 10;
  const currentMonthCutoff = referenceDate.startOf('month').date(cutoffDay);
  return referenceDate.date() >= cutoffDay
    ? currentMonthCutoff
    : currentMonthCutoff.subtract(1, 'month');
}

function buildPeriods(mode: PeriodMode, now: Dayjs, count = 12): PeriodDefinition[] {
  const periods: PeriodDefinition[] = [];

  if (mode === 'calendar') {
    for (let i = count - 1; i >= 0; i--) {
      const startDate = now.subtract(i, 'month').startOf('month');
      const endDate = startDate.endOf('month');
      periods.push({
        key: startDate.format('YYYY-MM'),
        label: getHebrewMonthName(startDate.month()),
        subLabel: String(startDate.year()),
        chartLabel: getHebrewMonthName(startDate.month()),
        startDate,
        endDate,
        isCurrent: i === 0,
      });
    }
    return periods;
  }

  const currentCycleStart = getCurrentBillingCycleStart(now);
  for (let i = count - 1; i >= 0; i--) {
    const startDate = currentCycleStart.subtract(i, 'month');
    const endDate = startDate.add(1, 'month').subtract(1, 'day');
    periods.push({
      key: startDate.format('YYYY-MM'),
      label: getHebrewMonthName(startDate.month()),
      subLabel: `${startDate.format('DD/MM')} - ${endDate.format('DD/MM/YYYY')}`,
      chartLabel: getHebrewMonthName(startDate.month()),
      startDate,
      endDate,
      isCurrent: i === 0,
    });
  }

  return periods;
}

function getPeriodKey(txDate: Dayjs, mode: PeriodMode): string {
  if (mode === 'calendar') return txDate.format('YYYY-MM');

  const cutoffDay = 10;
  const cycleStart = txDate.date() >= cutoffDay
    ? txDate.startOf('month').date(cutoffDay)
    : txDate.subtract(1, 'month').startOf('month').date(cutoffDay);
  return cycleStart.format('YYYY-MM');
}

function buildDataset(
  transactions: TransactionWithCategory[],
  mode: PeriodMode,
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
    const periodKey = getPeriodKey(dayjs(tx.date), mode);
    if (!monthMap[periodKey]) continue;

    const amount = new Decimal(tx.amount.toString());
    monthMap[periodKey].transactionCount++;

    if (amount.greaterThan(0)) {
      monthMap[periodKey].income = monthMap[periodKey].income.plus(amount);
    } else {
      monthMap[periodKey].expense = monthMap[periodKey].expense.plus(amount.abs());
    }

    if (tx.category && amount.lessThan(0)) {
      const catId = tx.category.id;
      if (!monthMap[periodKey].categories[catId]) {
        monthMap[periodKey].categories[catId] = {
          name: tx.category.name,
          icon: tx.category.icon || '',
          color: tx.category.color || '#888888',
          total: new Decimal(0),
        };
      }
      monthMap[periodKey].categories[catId].total = monthMap[periodKey].categories[catId].total.plus(amount.abs());
    }
  }

  const months = [...periods]
    .reverse()
    .map((period) => {
      const agg = monthMap[period.key];
      const topCategories = Object.values(agg.categories)
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
        income: agg.income.toNumber(),
        expense: agg.expense.toNumber(),
        balance: agg.income.minus(agg.expense).toNumber(),
        transactionCount: agg.transactionCount,
        topCategories,
      };
    });

  const categoryBreakdowns: Record<string, { id: string; name: string; value: number; color: string; icon: string }[]> = {};
  const categoryOptionsMap: Record<string, { id: string; name: string; icon: string; color: string }> = {};

  for (const period of periods) {
    const agg = monthMap[period.key];
    categoryBreakdowns[period.key] = Object.entries(agg.categories)
      .map(([categoryId, category]) => ({
        id: categoryId,
        name: category.name,
        value: category.total.toNumber(),
        color: category.color,
        icon: category.icon,
      }))
      .sort((a, b) => b.value - a.value);

    for (const [categoryId, category] of Object.entries(agg.categories)) {
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

  const categoryOptions = Object.values(categoryOptionsMap).sort((a, b) => a.name.localeCompare(b.name, 'he'));

  return { months, categoryBreakdowns, categoryOptions };
}

async function getMonthlySummaryData() {
  const now = dayjs();
  const calendarPeriods = buildPeriods('calendar', now);
  const billingPeriods = buildPeriods('billing', now);

  const allPeriods = [...calendarPeriods, ...billingPeriods];
  const minStart = allPeriods.reduce((min, period) => (period.startDate.isBefore(min) ? period.startDate : min), allPeriods[0].startDate);
  const maxEnd = allPeriods.reduce((max, period) => (period.endDate.isAfter(max) ? period.endDate : max), allPeriods[0].endDate);

  const transactions = await prisma.transaction.findMany({
    where: {
      date: { gte: minStart.startOf('day').toDate(), lte: maxEnd.endOf('day').toDate() },
      isExcluded: false,
    },
    include: { category: true },
    orderBy: { date: 'desc' },
  });

  const calendar = buildDataset(transactions, 'calendar', calendarPeriods);
  const billing = buildDataset(transactions, 'billing', billingPeriods);

  return { calendar, billing };
}

export default async function MonthlySummaryPage() {
  const { calendar, billing } = await getMonthlySummaryData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">סיכום חודשי</h1>
        <p className="text-gray-600 mt-1">מעקב תזרים מזומנים לפי חודשים או מחזור חיוב</p>
      </div>

      <MonthlySummaryView
        calendar={calendar}
        billing={billing}
      />
    </div>
  );
}
