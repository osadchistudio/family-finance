'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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
  selectedCategoryIds: string[];
  categoryOptions: CategoryOption[];
  onCategoryChange: (categoryIds: string[]) => void;
}

export function CategoryExpenseTrendChart({
  months,
  categoryBreakdowns,
  selectedCategoryIds,
  categoryOptions,
  onCategoryChange,
}: CategoryExpenseTrendChartProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showLimitMessage, setShowLimitMessage] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectedCategories = categoryOptions.filter((category) => selectedCategoryIds.includes(category.id));
  const sortedMonths = useMemo(
    () => [...months].sort((a, b) => a.monthKey.localeCompare(b.monthKey)),
    [months]
  );
  const monthsCount = Math.max(sortedMonths.length, 1);

  const keyByCategoryId = useMemo(
    () => Object.fromEntries(categoryOptions.map((category) => [category.id, `cat_${category.id}`])),
    [categoryOptions]
  );

  const keyMeta = useMemo(() => {
    const entries: Record<string, { name: string; color: string }> = {
      totalExpense: { name: 'סה״כ הוצאות', color: '#EF4444' },
    };

    for (const category of categoryOptions) {
      entries[keyByCategoryId[category.id]] = {
        name: `${category.icon} ${category.name}`.trim(),
        color: category.color || '#6B7280',
      };
    }
    return entries;
  }, [categoryOptions, keyByCategoryId]);

  const trendData = useMemo(() => {
    return sortedMonths.map((month) => {
        const date = dayjs(`${month.monthKey}-01`);
        const row: Record<string, number | string> = {
          monthHebrew: getHebrewMonthName(date.month()),
          totalExpense: month.expense,
        };

        const monthCategories = categoryBreakdowns[month.monthKey] || [];
        for (const categoryId of selectedCategoryIds) {
          const matchingCategory = monthCategories.find((category) => category.id === categoryId);
          row[keyByCategoryId[categoryId]] = matchingCategory?.value || 0;
        }

        return row;
      });
  }, [sortedMonths, categoryBreakdowns, selectedCategoryIds, keyByCategoryId]);

  const categoryAverageById = useMemo(() => {
    const totals = new Map<string, number>();

    for (const month of sortedMonths) {
      const monthCategories = categoryBreakdowns[month.monthKey] || [];
      for (const category of monthCategories) {
        totals.set(category.id, (totals.get(category.id) || 0) + category.value);
      }
    }

    return Object.fromEntries(
      categoryOptions.map((category) => [category.id, (totals.get(category.id) || 0) / monthsCount])
    );
  }, [sortedMonths, categoryBreakdowns, categoryOptions, monthsCount]);

  const categoryAverages = useMemo(() => {
    if (selectedCategories.length === 0) return [];

    return selectedCategories.map((category) => {
      return {
        id: category.id,
        name: category.name,
        icon: category.icon,
        color: category.color,
        average: Number(categoryAverageById[category.id] || 0),
      };
    }).sort((a, b) => b.average - a.average);
  }, [selectedCategories, categoryAverageById]);

  const totalExpenseAverage = useMemo(
    () => sortedMonths.reduce((sum, month) => sum + month.expense, 0) / monthsCount,
    [sortedMonths, monthsCount]
  );

  const selectedCategoriesAverage = useMemo(
    () => categoryAverages.reduce((sum, category) => sum + category.average, 0),
    [categoryAverages]
  );

  const selectedSummaryLabel = useMemo(() => {
    if (selectedCategories.length === 0) return 'בחר עד 5 קטגוריות';
    if (selectedCategories.length === 1) {
      const category = selectedCategories[0];
      return `${category.icon} ${category.name}`;
    }
    return `${selectedCategories.length} קטגוריות נבחרו`;
  }, [selectedCategories]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!dropdownRef.current || dropdownRef.current.contains(event.target as Node)) return;
      setIsDropdownOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleCategory = (categoryId: string) => {
    const isSelected = selectedCategoryIds.includes(categoryId);

    if (isSelected) {
      onCategoryChange(selectedCategoryIds.filter((id) => id !== categoryId));
      setShowLimitMessage(false);
      return;
    }

    if (selectedCategoryIds.length >= 5) {
      setShowLimitMessage(true);
      return;
    }

    setShowLimitMessage(false);
    onCategoryChange([...selectedCategoryIds, categoryId]);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <h3 className="text-lg font-semibold text-gray-900">מגמת הוצאות לפי קטגוריה</h3>
      </div>

      <div className="mb-4 space-y-2">
        <div className="relative w-full sm:w-[340px]" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsDropdownOpen((open) => !open)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm flex items-center justify-between gap-2 hover:bg-gray-50"
          >
            <span className="truncate">{selectedSummaryLabel}</span>
            <span className="text-xs text-gray-500">▾</span>
          </button>

          {isDropdownOpen && (
            <div className="absolute z-20 mt-2 w-full rounded-lg border border-gray-200 bg-white shadow-lg p-2">
              <p className="text-xs text-gray-500 px-2 py-1">בחר עד 5 קטגוריות</p>
              <div className="max-h-56 overflow-y-auto space-y-1">
                {categoryOptions.map((category) => {
                  const checked = selectedCategoryIds.includes(category.id);
                  return (
                    <label
                      key={category.id}
                      className={`flex items-center justify-between gap-2 text-sm px-2 py-2 rounded cursor-pointer transition-colors ${
                        checked ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'
                      }`}
                    >
                      <span className="truncate text-gray-700">
                        {category.icon} {category.name}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-gray-500">{formatCurrency(Number(categoryAverageById[category.id] || 0))}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCategory(category.id)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setShowLimitMessage(false);
                    onCategoryChange([]);
                    setIsDropdownOpen(false);
                  }}
                  className="text-xs text-gray-600 hover:text-gray-900"
                >
                  נקה בחירה (סה״כ הוצאות)
                </button>
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(false)}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  סגור
                </button>
              </div>
            </div>
          )}
        </div>

        {showLimitMessage && <p className="text-xs text-red-600">אפשר לבחור עד 5 קטגוריות במקביל</p>}

        <p className="text-sm text-gray-600">
          {selectedCategoryIds.length === 0
            ? `ממוצע חודשי לכל החודשים (סה״כ הוצאות): ${formatCurrency(totalExpenseAverage)}`
            : `ממוצע חודשי לכל החודשים בקטגוריות שנבחרו: ${formatCurrency(selectedCategoriesAverage)}`}
        </p>
      </div>

      <div style={{ height: 256 }}>
        <ResponsiveContainer width="100%" height={256}>
          <LineChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
              formatter={(value, name) => {
                const key = String(name);
                const meta = keyMeta[key];
                return [formatCurrency(Number(value)), meta ? meta.name : key];
              }}
              labelFormatter={(label) => String(label)}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                direction: 'rtl',
              }}
            />

            {selectedCategoryIds.length === 0 ? (
              <Line
                type="monotone"
                dataKey="totalExpense"
                stroke="#EF4444"
                strokeWidth={2}
                dot={false}
                name="totalExpense"
              />
            ) : (
              selectedCategories.map((category) => (
                <Line
                  key={category.id}
                  type="monotone"
                  dataKey={keyByCategoryId[category.id]}
                  stroke={category.color || '#6B7280'}
                  strokeWidth={2}
                  dot={false}
                  name={keyByCategoryId[category.id]}
                />
              ))
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {selectedCategoryIds.length > 0 && (
        <div className="mt-4 border-t pt-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">ממוצע חודשי לכל התקופה לפי קטגוריה</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {categoryAverages.map((category) => (
              <div key={category.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                <span className="text-sm text-gray-700 truncate">
                  {category.icon} {category.name}
                </span>
                <span className="text-sm font-semibold" style={{ color: category.color || '#6B7280' }}>
                  {formatCurrency(category.average)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
