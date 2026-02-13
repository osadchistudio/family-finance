'use client';

import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency, getHebrewMonthName } from '@/lib/formatters';
import dayjs from 'dayjs';
import { MonthSummaryData } from './MonthCard';

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

interface CategoryExpenseTrendChartProps {
  months: MonthSummaryData[];
  categoryBreakdowns: Record<string, CategoryBreakdownItem[]>;
  selectedCategoryId: string;
  categoryOptions: CategoryOption[];
  onCategoryChange: (categoryId: string) => void;
}

export function CategoryExpenseTrendChart({
  months,
  categoryBreakdowns,
  selectedCategoryId,
  categoryOptions,
  onCategoryChange,
}: CategoryExpenseTrendChartProps) {
  const selectedCategory = selectedCategoryId
    ? categoryOptions.find((category) => category.id === selectedCategoryId) || null
    : null;
  const lineColor = selectedCategory?.color || '#EF4444';

  const trendData = useMemo(() => {
    return [...months]
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
      .map((month) => {
        const date = dayjs(`${month.monthKey}-01`);
        const matchingCategory = selectedCategoryId
          ? (categoryBreakdowns[month.monthKey] || []).find((category) => category.id === selectedCategoryId)
          : null;

        return {
          monthHebrew: getHebrewMonthName(date.month()),
          value: selectedCategoryId ? (matchingCategory?.value || 0) : month.expense,
        };
      });
  }, [months, categoryBreakdowns, selectedCategoryId]);

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h3 className="text-lg font-semibold text-gray-900">מגמת הוצאות לפי קטגוריה</h3>
        <select
          value={selectedCategoryId}
          onChange={(event) => onCategoryChange(event.target.value)}
          className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">כל ההוצאות</option>
          {categoryOptions.map((category) => (
            <option key={category.id} value={category.id}>
              {category.icon} {category.name}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-gray-500 mb-3">
        {selectedCategory
          ? `מציג הוצאה חודשית עבור ${selectedCategory.icon} ${selectedCategory.name}`
          : 'מציג הוצאה חודשית כוללת'}
      </p>

      <div style={{ height: 256 }}>
        <ResponsiveContainer width="100%" height={256}>
          <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="categoryExpenseFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={lineColor} stopOpacity={0.28} />
                <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="monthHebrew"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={(value) => `${(value / 1000).toFixed(0)}K`}
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={50}
            />
            <Tooltip
              formatter={(value) => [formatCurrency(Number(value)), selectedCategory ? selectedCategory.name : 'סה״כ הוצאות']}
              labelFormatter={(label) => String(label)}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                direction: 'rtl',
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={lineColor}
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#categoryExpenseFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
