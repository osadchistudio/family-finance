'use client';

import { formatCurrency } from '@/lib/formatters';
import { TrendingUp, TrendingDown, Wallet, PiggyBank } from 'lucide-react';

interface SummaryCardProps {
  title: string;
  value: number;
  type: 'income' | 'expense' | 'balance' | 'savings';
  trend?: number;
}

const icons = {
  income: TrendingUp,
  expense: TrendingDown,
  balance: Wallet,
  savings: PiggyBank
};

const colors = {
  income: 'text-green-600 bg-green-50',
  expense: 'text-red-600 bg-red-50',
  balance: 'text-blue-600 bg-blue-50',
  savings: 'text-purple-600 bg-purple-50'
};

export function SummaryCard({ title, value, type, trend }: SummaryCardProps) {
  const Icon = icons[type];
  const colorClass = colors[type];

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className={`text-2xl font-bold mt-1 ${
            type === 'expense' ? 'text-red-600' : type === 'income' ? 'text-green-600' : 'text-gray-900'
          }`}>
            {formatCurrency(Math.abs(value))}
          </p>
          {trend !== undefined && (
            <p className={`text-sm mt-1 ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trend >= 0 ? '+' : ''}{trend.toFixed(1)}% מהחודש הקודם
            </p>
          )}
        </div>
        <div className={`p-3 rounded-full ${colorClass}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}
