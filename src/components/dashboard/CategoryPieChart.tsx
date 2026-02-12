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
}

export function CategoryPieChart({ data }: CategoryPieChartProps) {
  const total = data.reduce((sum, cat) => sum + cat.value, 0);

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
      <h3 className="text-lg font-semibold text-gray-900 mb-4">ממוצע הוצאות חודשי לפי קטגוריה</h3>
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="w-full lg:w-1/2" style={{ height: 256 }}>
          <ResponsiveContainer width="100%" height={256}>
            <PieChart>
              <Pie
                data={data.slice(0, 8)} // Show top 8 categories
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {data.slice(0, 8).map((entry, index) => (
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
          <div className="space-y-2">
            {data.slice(0, 6).map((category, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                  <span className="text-sm text-gray-700">{category.icon} {category.name}</span>
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-900">{formatCurrency(category.value)}</p>
                  <p className="text-xs text-gray-500">{((category.value / total) * 100).toFixed(0)}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
