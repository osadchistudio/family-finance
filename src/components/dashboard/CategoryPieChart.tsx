'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCurrency } from '@/lib/formatters';

interface CategoryData {
  name: string;
  value: number;
  color: string;
  icon: string;
}

interface CategoryPieChartProps {
  data: CategoryData[];
  averageIncome: number;
}

const MAX_PIE_SEGMENTS = 8;

export function CategoryPieChart({ data, averageIncome }: CategoryPieChartProps) {
  const pieBase = data.slice(0, MAX_PIE_SEGMENTS);
  const remainingValue = data
    .slice(MAX_PIE_SEGMENTS)
    .reduce((sum, category) => sum + category.value, 0);
  const pieData = remainingValue > 0
    ? [
      ...pieBase,
      { name: 'אחר', value: remainingValue, color: '#D1D5DB', icon: '' },
    ]
    : pieBase;

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">ממוצע הוצאות חודשי לפי קטגוריה</h3>
        <div className="h-64 flex items-center justify-center text-gray-500">
          אין נתונים להצגה
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-1">ממוצע הוצאות חודשי לפי קטגוריה</h3>
      <p className="text-sm text-gray-500 mb-4">
        פריסת כל הקטגוריות ואחוז מתוך ממוצע ההכנסה החודשית
      </p>
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="w-full lg:w-1/2" style={{ height: 256 }}>
          <ResponsiveContainer width="100%" height={256}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => `${formatCurrency(Number(value))} בממוצע לחודש`}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  direction: 'rtl'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="w-full lg:w-1/2 flex flex-col justify-center">
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {data.map((category) => {
              const incomeShare = averageIncome > 0
                ? (category.value / averageIncome) * 100
                : null;

              return (
                <div key={category.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="text-sm text-gray-700">{category.icon} {category.name}</span>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-900">{formatCurrency(category.value)}</p>
                    <p className="text-xs text-gray-500">
                      {incomeShare === null ? '—' : `${incomeShare.toFixed(1)}% מהכנסה`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
