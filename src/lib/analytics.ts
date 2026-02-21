import dayjs from 'dayjs';
import { Decimal } from 'decimal.js';
import {
  PeriodDefinition,
  PeriodMode,
  getPeriodKey,
  isBankInstitution,
  isCreditInstitution,
} from '@/lib/period-utils';

export interface AnalyticsTransactionInput {
  date: Date | string;
  amount: Decimal.Value;
  category?: {
    id: string;
    name: string;
    color?: string | null;
    icon?: string | null;
  } | null;
  account?: {
    institution?: string | null;
  } | null;
}

export interface PeriodAggregate {
  income: Decimal;
  expense: Decimal;
  transactionCount: number;
  bankCount: number;
  creditCount: number;
}

export interface CategoryAggregate {
  id: string;
  name: string;
  color: string;
  icon: string;
  totalsByPeriod: Record<string, Decimal>;
  total: Decimal;
}

export interface RequiredSources {
  requiresBank: boolean;
  requiresCredit: boolean;
}

export interface PeriodUsageSelection {
  periodKeysWithData: string[];
  completePeriodKeys: string[];
  periodsUsedForAverage: string[];
  periodsForAverageCount: number;
}

interface MonthlyTrendPoint {
  month: string;
  monthHebrew: string;
  income: number;
  expense: number;
  balance: number;
}

function createEmptyPeriodAggregate(): PeriodAggregate {
  return {
    income: new Decimal(0),
    expense: new Decimal(0),
    transactionCount: 0,
    bankCount: 0,
    creditCount: 0,
  };
}

export function aggregateTransactionsByPeriod(
  transactions: AnalyticsTransactionInput[],
  periods: PeriodDefinition[],
  periodMode: PeriodMode
) {
  const periodAggregates: Record<string, PeriodAggregate> = {};
  const categoryAggregates: Record<string, CategoryAggregate> = {};
  const requiredSources: RequiredSources = {
    requiresBank: false,
    requiresCredit: false,
  };

  for (const period of periods) {
    periodAggregates[period.key] = createEmptyPeriodAggregate();
  }

  for (const tx of transactions) {
    const periodKey = getPeriodKey(dayjs(tx.date), periodMode);
    const aggregate = periodAggregates[periodKey];
    if (!aggregate) continue;

    const amount = new Decimal(tx.amount.toString());
    aggregate.transactionCount++;

    if (amount.greaterThan(0)) {
      aggregate.income = aggregate.income.plus(amount);
    } else {
      aggregate.expense = aggregate.expense.plus(amount.abs());
    }

    if (isBankInstitution(tx.account?.institution)) {
      aggregate.bankCount++;
      requiredSources.requiresBank = true;
    }

    if (isCreditInstitution(tx.account?.institution)) {
      aggregate.creditCount++;
      requiredSources.requiresCredit = true;
    }

    if (tx.category && amount.lessThan(0)) {
      const categoryId = tx.category.id;
      if (!categoryAggregates[categoryId]) {
        categoryAggregates[categoryId] = {
          id: categoryId,
          name: tx.category.name,
          color: tx.category.color || '#888888',
          icon: tx.category.icon || '',
          totalsByPeriod: {},
          total: new Decimal(0),
        };
      }

      const category = categoryAggregates[categoryId];
      category.totalsByPeriod[periodKey] = (category.totalsByPeriod[periodKey] || new Decimal(0)).plus(amount.abs());
      category.total = category.total.plus(amount.abs());
    }
  }

  return {
    periodAggregates,
    categoryAggregates,
    requiredSources,
  };
}

export function selectPeriodsForAverages(
  periodAggregates: Record<string, PeriodAggregate>,
  requiredSources: RequiredSources
): PeriodUsageSelection {
  const periodEntries = Object.entries(periodAggregates);

  const periodKeysWithData = periodEntries
    .filter(([, entry]) => entry.income.greaterThan(0) || entry.expense.greaterThan(0))
    .map(([key]) => key);

  const completePeriodKeys = periodEntries
    .filter(([, entry]) => entry.income.greaterThan(0) || entry.expense.greaterThan(0))
    .filter(
      ([, entry]) =>
        (!requiredSources.requiresBank || entry.bankCount > 0) &&
        (!requiredSources.requiresCredit || entry.creditCount > 0)
    )
    .map(([key]) => key);

  const periodsUsedForAverage = completePeriodKeys.length > 0 ? completePeriodKeys : periodKeysWithData;

  return {
    periodKeysWithData,
    completePeriodKeys,
    periodsUsedForAverage,
    periodsForAverageCount: Math.max(periodsUsedForAverage.length, 1),
  };
}

export function buildMonthlyTrends(
  periods: PeriodDefinition[],
  periodAggregates: Record<string, PeriodAggregate>
): MonthlyTrendPoint[] {
  return periods.map((period) => {
    const data = periodAggregates[period.key] || createEmptyPeriodAggregate();
    return {
      month: period.key,
      monthHebrew: period.chartLabel,
      income: data.income.toNumber(),
      expense: data.expense.toNumber(),
      balance: data.income.minus(data.expense).toNumber(),
    };
  });
}

export function buildAverageCategoryBreakdown(
  categoryAggregates: Record<string, CategoryAggregate>,
  periodsUsedForAverage: string[],
  periodsForAverageCount: number
) {
  return Object.values(categoryAggregates)
    .map((category) => {
      const totalInPeriods = periodsUsedForAverage.reduce(
        (sum, periodKey) => sum.plus(category.totalsByPeriod[periodKey] || 0),
        new Decimal(0)
      );

      return {
        name: category.name,
        value: totalInPeriods.div(periodsForAverageCount).toNumber(),
        color: category.color,
        icon: category.icon,
      };
    })
    .filter((category) => category.value > 0)
    .sort((a, b) => b.value - a.value);
}
