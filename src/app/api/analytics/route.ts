import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import dayjs from 'dayjs';
import { Decimal } from 'decimal.js';
import { buildPeriods } from '@/lib/period-utils';
import { getPeriodModeSetting } from '@/lib/system-settings';
import {
  aggregateTransactionsByPeriod,
  buildMonthlyTrends,
  selectPeriodsForAverages,
} from '@/lib/analytics';

export const dynamic = 'force-dynamic';

const DEFAULT_MONTHS = 6;
const MAX_MONTHS = 24;

function parseMonthsParam(value: string | null) {
  if (!value) return DEFAULT_MONTHS;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_MONTHS;
  return Math.min(Math.max(parsed, 1), MAX_MONTHS);
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const months = parseMonthsParam(searchParams.get('months'));
    const periodMode = await getPeriodModeSetting();

    const periods = buildPeriods(periodMode, dayjs(), months);
    const startDate = periods[0].startDate.startOf('day').toDate();
    const endDate = periods[periods.length - 1].endDate.endOf('day').toDate();

    // Get all transactions in the period
    const transactions = await prisma.transaction.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        isExcluded: false
      },
      include: { category: true, account: true }
    });

    const { periodAggregates, categoryAggregates, requiredSources } = aggregateTransactionsByPeriod(
      transactions,
      periods,
      periodMode
    );
    const { periodKeysWithData } = selectPeriodsForAverages(periodAggregates, requiredSources);

    // Current month stats
    const currentMonth = periods[periods.length - 1]?.key || dayjs().format('YYYY-MM');
    const currentMonthData = periodAggregates[currentMonth] || {
      income: new Decimal(0),
      expense: new Decimal(0),
    };

    const monthlyTrends = buildMonthlyTrends(periods, periodAggregates);

    // Format category breakdown
    const categoryBreakdown = Object.values(categoryAggregates)
      .map(cat => ({
        name: cat.name,
        value: cat.total.toNumber(),
        color: cat.color,
        icon: cat.icon
      }))
      .sort((a, b) => b.value - a.value);

    // Calculate averages
    const totalExpense = Object.values(periodAggregates).reduce(
      (sum, period) => sum.plus(period.expense),
      new Decimal(0)
    );
    const periodsWithData = Math.max(1, periodKeysWithData.length);
    const avgMonthlyExpense = totalExpense.dividedBy(periodsWithData);

    return NextResponse.json({
      summary: {
        currentMonthIncome: currentMonthData.income.toNumber(),
        currentMonthExpense: currentMonthData.expense.toNumber(),
        currentMonthBalance: currentMonthData.income.minus(currentMonthData.expense).toNumber(),
        avgMonthlyExpense: avgMonthlyExpense.toNumber()
      },
      monthlyTrends,
      categoryBreakdown,
      totalTransactions: transactions.length,
      periodMode
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json(
      { error: 'Failed to get analytics' },
      { status: 500 }
    );
  }
}
