import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import dayjs from 'dayjs';
import { Decimal } from 'decimal.js';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const months = parseInt(searchParams.get('months') || '6');

    const startDate = dayjs().subtract(months, 'month').startOf('month').toDate();
    const endDate = dayjs().endOf('month').toDate();

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
    const currentMonth = dayjs().format('YYYY-MM');
    const currentMonthData = monthlyData[currentMonth] || { income: new Decimal(0), expense: new Decimal(0) };

    // Format monthly trends for chart
    const monthlyTrends = [];
    for (let i = months - 1; i >= 0; i--) {
      const month = dayjs().subtract(i, 'month');
      const key = month.format('YYYY-MM');
      const data = monthlyData[key] || { income: new Decimal(0), expense: new Decimal(0) };
      monthlyTrends.push({
        month: month.format('MM/YYYY'),
        monthHebrew: getHebrewMonth(month.month()),
        income: data.income.toNumber(),
        expense: data.expense.toNumber(),
        balance: data.income.minus(data.expense).toNumber()
      });
    }

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
    const avgMonthlyExpense = totalExpense.dividedBy(Math.max(Object.keys(monthlyData).length, 1));

    return NextResponse.json({
      summary: {
        currentMonthIncome: currentMonthData.income.toNumber(),
        currentMonthExpense: currentMonthData.expense.toNumber(),
        currentMonthBalance: currentMonthData.income.minus(currentMonthData.expense).toNumber(),
        avgMonthlyExpense: avgMonthlyExpense.toNumber()
      },
      monthlyTrends,
      categoryBreakdown,
      totalTransactions: transactions.length
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json(
      { error: 'Failed to get analytics' },
      { status: 500 }
    );
  }
}

function getHebrewMonth(month: number): string {
  const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  return months[month];
}
