import dayjs from 'dayjs';
import { prisma } from '@/lib/prisma';
import { getPeriodModeSetting } from '@/lib/system-settings';
import {
  PeriodMode,
  PeriodDefinition,
  buildPeriodLabels,
  buildPeriods,
} from '@/lib/period-utils';
import { MonthlySummaryView } from '@/components/monthly-summary/MonthlySummaryView';
import {
  aggregateTransactionsByPeriod,
  CategoryAggregate,
  PeriodAggregate,
  RequiredSources,
} from '@/lib/analytics';

export const dynamic = 'force-dynamic';

interface MonthlyDataset {
  months: {
    monthKey: string;
    label: string;
    subLabel: string;
    chartLabel: string;
    periodStart: string;
    periodEnd: string;
    isCurrentPeriod: boolean;
    isDataComplete: boolean;
    missingSources: string[];
    hasBankActivity: boolean;
    hasCreditActivity: boolean;
    income: number;
    expense: number;
    balance: number;
    transactionCount: number;
    topCategories: { name: string; icon: string; color: string; total: number }[];
  }[];
  categoryBreakdowns: Record<string, { id: string; name: string; value: number; color: string; icon: string }[]>;
  categoryOptions: { id: string; name: string; icon: string; color: string }[];
}

function buildDataset(
  periodAggregates: Record<string, PeriodAggregate>,
  categoryAggregates: Record<string, CategoryAggregate>,
  periods: PeriodDefinition[],
  requiredSources: RequiredSources
): MonthlyDataset {
  const categoryEntries = Object.values(categoryAggregates);

  const months = [...periods]
    .reverse()
    .map((period) => {
      const aggregate = periodAggregates[period.key];
      const categoriesInPeriod = categoryEntries
        .map((category) => ({
          id: category.id,
          name: category.name,
          icon: category.icon,
          color: category.color,
          total: category.totalsByPeriod[period.key]?.toNumber() || 0,
        }))
        .filter((category) => category.total > 0)
        .sort((a, b) => b.total - a.total);
      const topCategories = categoriesInPeriod.slice(0, 5);

      return {
        isDataComplete:
          (!requiredSources.requiresBank || aggregate.bankCount > 0) &&
          (!requiredSources.requiresCredit || aggregate.creditCount > 0),
        missingSources: [
          ...(requiredSources.requiresBank && aggregate.bankCount === 0 ? ['עו״ש'] : []),
          ...(requiredSources.requiresCredit && aggregate.creditCount === 0 ? ['אשראי'] : []),
        ],
        hasBankActivity: aggregate.bankCount > 0,
        hasCreditActivity: aggregate.creditCount > 0,
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

  for (const period of periods) {
    categoryBreakdowns[period.key] = categoryEntries
      .map((category) => ({
        id: category.id,
        name: category.name,
        value: category.totalsByPeriod[period.key]?.toNumber() || 0,
        color: category.color,
        icon: category.icon,
      }))
      .filter((category) => category.value > 0)
      .sort((a, b) => b.value - a.value);
  }

  return {
    months,
    categoryBreakdowns,
    categoryOptions: categoryEntries
      .map((category) => ({
        id: category.id,
        name: category.name,
        icon: category.icon,
        color: category.color,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he')),
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
    },
    orderBy: { date: 'desc' },
  });

  const { periodAggregates, categoryAggregates, requiredSources } = aggregateTransactionsByPeriod(
    transactions,
    periods,
    periodMode
  );

  return buildDataset(periodAggregates, categoryAggregates, periods, requiredSources);
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
