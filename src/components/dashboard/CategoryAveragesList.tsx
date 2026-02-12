'use client';

import { formatCurrency } from '@/lib/formatters';

interface CategoryAverageItem {
  name: string;
  value: number;
  color: string;
  icon: string;
}

interface CategoryAveragesListProps {
  data: CategoryAverageItem[];
}

export function CategoryAveragesList({ data }: CategoryAveragesListProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">ממוצע הוצאות חודשי לפי קטגוריה</h3>
        <div className="py-8 text-center text-gray-500">
          אין נתונים להצגה
        </div>
      </div>
    );
  }

  const topCategories = data.slice(0, 10);
  const totalAverage = topCategories.reduce((sum, cat) => sum + cat.value, 0);

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-1">ממוצע הוצאות חודשי לפי קטגוריה</h3>
      <p className="text-sm text-gray-500 mb-4">כמה מוציאים בממוצע בכל קטגוריה</p>

      <div className="space-y-3">
        {topCategories.map((category) => {
          const percentage = totalAverage > 0 ? (category.value / totalAverage) * 100 : 0;

          return (
            <div key={category.name} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-800">
                  <span>{category.icon}</span>
                  <span>{category.name}</span>
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-gray-900">{formatCurrency(category.value)}</p>
                  <p className="text-xs text-gray-500">{percentage.toFixed(0)}%</p>
                </div>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(4, Math.min(100, percentage))}%`,
                    backgroundColor: category.color
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
