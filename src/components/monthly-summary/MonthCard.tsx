'use client';

import { formatCurrency, getHebrewMonthName } from '@/lib/formatters';
import { TrendingUp, TrendingDown, Receipt } from 'lucide-react';
import dayjs from 'dayjs';

export interface MonthSummaryData {
  monthKey: string; // YYYY-MM
  income: number;
  expense: number;
  balance: number;
  transactionCount: number;
  topCategories: { name: string; icon: string; color: string; total: number }[];
}

interface MonthCardProps {
  data: MonthSummaryData;
  isCurrentMonth: boolean;
  onClick: (monthKey: string) => void;
}

export function MonthCard({ data, isCurrentMonth, onClick }: MonthCardProps) {
  const date = dayjs(data.monthKey + '-01');
  const monthName = getHebrewMonthName(date.month());
  const year = date.year();

  return (
    <button
      onClick={() => onClick(data.monthKey)}
      className={`w-full text-right bg-white rounded-xl shadow-sm p-5 transition-all hover:shadow-md hover:scale-[1.02] cursor-pointer ${
        isCurrentMonth ? 'ring-2 ring-blue-500 border-blue-200' : 'border border-gray-100'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{monthName}</h3>
          <p className="text-sm text-gray-500">{year}</p>
        </div>
        {isCurrentMonth && (
          <span className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded-full">
            חודש נוכחי
          </span>
        )}
      </div>

      {/* Income / Expense */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <span className="text-sm text-gray-600">הכנסות</span>
          </div>
          <span className="text-sm font-semibold text-green-600">
            {formatCurrency(data.income)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <TrendingDown className="h-4 w-4 text-red-500" />
            <span className="text-sm text-gray-600">הוצאות</span>
          </div>
          <span className="text-sm font-semibold text-red-600">
            {formatCurrency(data.expense)}
          </span>
        </div>
      </div>

      {/* Balance */}
      <div className="border-t pt-3 mb-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">יתרה</span>
          <span className={`text-base font-bold ${data.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {data.balance >= 0 ? '+' : ''}{formatCurrency(data.balance)}
          </span>
        </div>
      </div>

      {/* Transaction count */}
      <div className="flex items-center gap-1.5 text-gray-400 mb-3">
        <Receipt className="h-3.5 w-3.5" />
        <span className="text-xs">{data.transactionCount} תנועות</span>
      </div>

      {/* Top categories */}
      {data.topCategories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.topCategories.slice(0, 3).map((cat, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
              style={{ backgroundColor: cat.color + '20', color: cat.color }}
            >
              {cat.icon} {cat.name}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
