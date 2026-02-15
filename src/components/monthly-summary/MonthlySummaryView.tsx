'use client';

import { useEffect, useMemo, useState } from 'react';
import { MonthCard, MonthSummaryData } from './MonthCard';
import { MonthDetail } from './MonthDetail';
import { SummaryCard } from '@/components/dashboard/SummaryCard';
import { ExpenseChart } from '@/components/dashboard/ExpenseChart';
import { CategoryExpenseTrendChart } from './CategoryExpenseTrendChart';

interface CategoryBreakdownItem {
  id: string;
  name: string;
  value: number;
  color: string;
  icon: string;
}

interface CategoryOption {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface MonthlySummaryViewProps {
  calendar: {
    months: MonthSummaryData[];
    categoryBreakdowns: Record<string, CategoryBreakdownItem[]>;
    categoryOptions: CategoryOption[];
  };
  billing: {
    months: MonthSummaryData[];
    categoryBreakdowns: Record<string, CategoryBreakdownItem[]>;
    categoryOptions: CategoryOption[];
  };
}

type PeriodMode = 'calendar' | 'billing';

export function MonthlySummaryView({ calendar, billing }: MonthlySummaryViewProps) {
  const [periodMode, setPeriodMode] = useState<PeriodMode>('calendar');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);

  const activeData = periodMode === 'calendar' ? calendar : billing;
  const months = activeData.months;
  const categoryBreakdowns = activeData.categoryBreakdowns;
  const categoryOptions = activeData.categoryOptions;

  useEffect(() => {
    setSelectedMonth(null);
    setSelectedCategoryIds([]);
  }, [periodMode]);

  // Calculate averages across all periods with data
  const monthsWithData = useMemo(() => months.filter((m) => m.transactionCount > 0), [months]);
  const avgIncome = useMemo(
    () => (monthsWithData.length > 0 ? monthsWithData.reduce((sum, m) => sum + m.income, 0) / monthsWithData.length : 0),
    [monthsWithData]
  );
  const avgExpense = useMemo(
    () => (monthsWithData.length > 0 ? monthsWithData.reduce((sum, m) => sum + m.expense, 0) / monthsWithData.length : 0),
    [monthsWithData]
  );
  const avgBalance = avgIncome - avgExpense;

  // Prepare chart data — sorted chronologically
  const chartData = useMemo(
    () =>
      [...months]
        .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
        .map((m) => ({
          month: m.monthKey,
          monthHebrew: m.chartLabel,
          income: m.income,
          expense: m.expense,
          balance: m.balance,
        })),
    [months]
  );

  // Detail mode
  if (selectedMonth) {
    const monthData = months.find((m) => m.monthKey === selectedMonth);
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
      <div className="inline-flex items-center rounded-xl border border-gray-200 bg-white p-1 gap-1">
        <button
          type="button"
          onClick={() => setPeriodMode('calendar')}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            periodMode === 'calendar' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          חודש קלנדרי (1-1)
        </button>
        <button
          type="button"
          onClick={() => setPeriodMode('billing')}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            periodMode === 'billing' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          מחזור חיוב (10-10)
        </button>
      </div>

      {/* Average summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard title="ממוצע הכנסות חודשי" value={avgIncome} type="income" />
        <SummaryCard title="ממוצע הוצאות חודשי" value={avgExpense} type="expense" />
        <SummaryCard title="ממוצע יתרה חודשי" value={avgBalance} type="balance" />
      </div>

      {/* Expense trend chart */}
      <ExpenseChart data={chartData} />
      <CategoryExpenseTrendChart
        months={months}
        categoryBreakdowns={categoryBreakdowns}
        selectedCategoryIds={selectedCategoryIds}
        categoryOptions={categoryOptions}
        onCategoryChange={setSelectedCategoryIds}
      />

      {/* Month cards grid */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {periodMode === 'calendar' ? 'סיכום לפי חודשים' : 'סיכום לפי מחזורי חיוב'}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {months.map((month) => (
            <MonthCard
              key={month.monthKey}
              data={month}
              onClick={setSelectedMonth}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
