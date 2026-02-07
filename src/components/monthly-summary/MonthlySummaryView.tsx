'use client';

import { useState } from 'react';
import { MonthCard, MonthSummaryData } from './MonthCard';
import { MonthDetail } from './MonthDetail';
import { SummaryCard } from '@/components/dashboard/SummaryCard';
import { ExpenseChart } from '@/components/dashboard/ExpenseChart';
import { getHebrewMonthName } from '@/lib/formatters';
import dayjs from 'dayjs';

interface CategoryBreakdownItem {
  name: string;
  value: number;
  color: string;
  icon: string;
}

interface MonthlySummaryViewProps {
  months: MonthSummaryData[];
  categoryBreakdowns: Record<string, CategoryBreakdownItem[]>;
}

export function MonthlySummaryView({ months, categoryBreakdowns }: MonthlySummaryViewProps) {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const currentMonthKey = dayjs().format('YYYY-MM');

  // Calculate averages across all months with data
  const monthsWithData = months.filter(m => m.transactionCount > 0);
  const avgIncome = monthsWithData.length > 0
    ? monthsWithData.reduce((sum, m) => sum + m.income, 0) / monthsWithData.length
    : 0;
  const avgExpense = monthsWithData.length > 0
    ? monthsWithData.reduce((sum, m) => sum + m.expense, 0) / monthsWithData.length
    : 0;
  const avgBalance = avgIncome - avgExpense;

  // Prepare chart data — sorted chronologically
  const chartData = [...months]
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
    .map(m => {
      const d = dayjs(m.monthKey + '-01');
      return {
        month: d.format('MM/YYYY'),
        monthHebrew: getHebrewMonthName(d.month()),
        income: m.income,
        expense: m.expense,
        balance: m.balance
      };
    });

  // Detail mode
  if (selectedMonth) {
    const monthData = months.find(m => m.monthKey === selectedMonth);
    if (!monthData) {
      setSelectedMonth(null);
      return null;
    }

    return (
      <MonthDetail
        data={monthData}
        categoryBreakdown={categoryBreakdowns[selectedMonth] || []}
        onBack={() => setSelectedMonth(null)}
      />
    );
  }

  // Overview mode
  return (
    <div className="space-y-6">
      {/* Average summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard title="ממוצע הכנסות חודשי" value={avgIncome} type="income" />
        <SummaryCard title="ממוצע הוצאות חודשי" value={avgExpense} type="expense" />
        <SummaryCard title="ממוצע יתרה חודשי" value={avgBalance} type="balance" />
      </div>

      {/* Expense trend chart */}
      <ExpenseChart data={chartData} />

      {/* Month cards grid */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">סיכום לפי חודשים</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {months.map(month => (
            <MonthCard
              key={month.monthKey}
              data={month}
              isCurrentMonth={month.monthKey === currentMonthKey}
              onClick={setSelectedMonth}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
