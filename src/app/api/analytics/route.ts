import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import dayjs from 'dayjs';
import { Decimal } from 'decimal.js';
import { buildPeriods, getPeriodKey } from '@/lib/period-utils';
import { getPeriodModeSetting } from '@/lib/system-settings';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const months = parseInt(searchParams.get('months') || '6');
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
      include: { category: true }
    });

    // Calculate monthly totals
    const monthlyData: Record<string, { income: Decimal; expense: Decimal }> = {};
    const categoryTotals: Record<string, { name: string; total: Decimal; color: string; icon: string }> = {};

    for (const period of periods) {
      monthlyData[period.key] = { income: new Decimal(0), expense: new Decimal(0) };
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

      // Category totals (expenses only)
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
    const currentMonth = periods[periods.length - 1]?.key || dayjs().format('YYYY-MM');
    const currentMonthData = monthlyData[currentMonth] || { income: new Decimal(0), expense: new Decimal(0) };

    // Format monthly trends for chart
    const monthlyTrends = periods.map((period) => {
      const data = monthlyData[period.key] || { income: new Decimal(0), expense: new Decimal(0) };
      return {
        month: period.key,
        monthHebrew: period.chartLabel,
        income: data.income.toNumber(),
        expense: data.expense.toNumber(),
        balance: data.income.minus(data.expense).toNumber()
      };
    });

    // Format category breakdown
    const categoryBreakdown = Object.values(categoryTotals)
      .map(cat => ({
        name: cat.name,
        value: cat.total.toNumber(),
        color: cat.color,
        icon: cat.icon
      }))
      .sort((a, b) => b.value - a.value);

    // Calculate averages
    const totalExpense = Object.values(monthlyData).reduce(
      (sum, m) => sum.plus(m.expense),
      new Decimal(0)
    );
    const periodsWithData = Math.max(
      1,
      Object.values(monthlyData).filter((entry) => entry.income.greaterThan(0) || entry.expense.greaterThan(0)).length
    );
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
