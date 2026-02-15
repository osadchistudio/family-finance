'use client';

import { useMemo, useState } from 'react';
import { MonthCard, MonthSummaryData } from './MonthCard';
import { MonthDetail } from './MonthDetail';
import { SummaryCard } from '@/components/dashboard/SummaryCard';
import { ExpenseChart } from '@/components/dashboard/ExpenseChart';
import { CategoryExpenseTrendChart } from './CategoryExpenseTrendChart';
import { PeriodMode, buildPeriodLabels } from '@/lib/period-utils';

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
  months: MonthSummaryData[];
  categoryBreakdowns: Record<string, CategoryBreakdownItem[]>;
  categoryOptions: CategoryOption[];
  periodMode: PeriodMode;
}

export function MonthlySummaryView({ months, categoryBreakdowns, categoryOptions, periodMode }: MonthlySummaryViewProps) {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const labels = buildPeriodLabels(periodMode);

  const monthsWithData = useMemo(() => months.filter((m) => m.transactionCount > 0), [months]);
  const completeMonthsWithData = useMemo(
    () => monthsWithData.filter((month) => month.isDataComplete),
    [monthsWithData]
  );
  const monthsUsedForAverages = completeMonthsWithData.length > 0 ? completeMonthsWithData : monthsWithData;
  const incompleteMonthsWithData = monthsWithData.length - completeMonthsWithData.length;
  const avgIncome = useMemo(
    () =>
      monthsUsedForAverages.length > 0
        ? monthsUsedForAverages.reduce((sum, month) => sum + month.income, 0) / monthsUsedForAverages.length
        : 0,
    [monthsUsedForAverages]
  );
  const avgExpense = useMemo(
    () =>
      monthsUsedForAverages.length > 0
        ? monthsUsedForAverages.reduce((sum, month) => sum + month.expense, 0) / monthsUsedForAverages.length
        : 0,
    [monthsUsedForAverages]
  );
  const avgBalance = avgIncome - avgExpense;

  const chartData = useMemo(
    () =>
      [...months]
        .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
        .map((month) => ({
          month: month.monthKey,
          monthHebrew: month.chartLabel,
          income: month.income,
          expense: month.expense,
          balance: month.balance,
        })),
    [months]
  );

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

  return (
    <div className="space-y-6">
      <div className="text-sm text-gray-500">
        מוצג לפי {labels.short}. ניתן לשנות ב״הגדרות״.
      </div>
      <div className="text-xs text-gray-500">
        ממוצעים מחושבים לפי {monthsUsedForAverages.length} תקופות מלאות.
        {incompleteMonthsWithData > 0 && ` ${incompleteMonthsWithData} תקופות עם נתונים חלקיים לא נכללו בממוצע.`}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard title="ממוצע הכנסות חודשי" value={avgIncome} type="income" />
        <SummaryCard title="ממוצע הוצאות חודשי" value={avgExpense} type="expense" />
        <SummaryCard title="ממוצע יתרה חודשי" value={avgBalance} type="balance" />
      </div>

      <ExpenseChart data={chartData} />
      <CategoryExpenseTrendChart
        months={months}
        categoryBreakdowns={categoryBreakdowns}
        selectedCategoryIds={selectedCategoryIds}
        categoryOptions={categoryOptions}
        onCategoryChange={setSelectedCategoryIds}
      />

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {periodMode === 'billing' ? 'סיכום לפי מחזורי חיוב' : 'סיכום לפי חודשים'}
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
