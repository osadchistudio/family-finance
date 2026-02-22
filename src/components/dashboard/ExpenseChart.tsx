'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '@/lib/formatters';

interface MonthlyData {
  month: string;
  monthHebrew: string;
  income: number;
  expense: number;
  balance: number;
}

interface ExpenseChartProps {
  data: MonthlyData[];
}

export function ExpenseChart({ data }: ExpenseChartProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-3 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">מגמת הוצאות</h3>
        <div className="h-[220px] sm:h-64 flex items-center justify-center text-gray-500">
          אין נתונים להצגה. העלה קבצי תנועות כדי לראות את הגרף.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-3 sm:p-6">
      <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">מגמת הוצאות והכנסות</h3>
      <div className="h-[220px] sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 0, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22C55E" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="monthHebrew"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={12}
            />
            <YAxis
              tickFormatter={(value) => `${(value / 1000).toFixed(0)}K`}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip
              formatter={(value, name) => [
                formatCurrency(Number(value)),
                name === 'income' ? 'הכנסות' : 'הוצאות'
              ]}
              labelFormatter={(label) => String(label)}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                direction: 'rtl'
              }}
            />
            <Area
              type="monotone"
              dataKey="income"
              stroke="#22C55E"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorIncome)"
              name="income"
            />
            <Area
              type="monotone"
              dataKey="expense"
              stroke="#EF4444"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorExpense)"
              name="expense"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-center gap-4 sm:gap-6 mt-3 sm:mt-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-xs sm:text-sm text-gray-600">הכנסות</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-xs sm:text-sm text-gray-600">הוצאות</span>
        </div>
      </div>
    </div>
  );
}
