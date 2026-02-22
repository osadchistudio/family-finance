'use client';

import Link from 'next/link';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { ArrowLeft } from 'lucide-react';

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: string;
  category: {
    name: string;
    icon: string;
    color: string;
  } | null;
}

interface RecentTransactionsProps {
  transactions: Transaction[];
}

export function RecentTransactions({ transactions }: RecentTransactionsProps) {
  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-3 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">תנועות אחרונות</h3>
        </div>
        <div className="py-8 text-center text-gray-500">
          אין תנועות להצגה. העלה קבצי תנועות כדי להתחיל.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-3 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900">תנועות אחרונות</h3>
        <Link
          href="/transactions"
          className="text-xs sm:text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
        >
          לכל התנועות
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </div>
      <div className="space-y-3">
        {transactions.map((tx) => {
          const amount = parseFloat(tx.amount);
          const isExpense = amount < 0;

          return (
            <div
              key={tx.id}
              className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
            >
              <div className="flex items-center gap-3">
                {tx.category ? (
                  <span className="text-lg">{tx.category.icon}</span>
                ) : (
                  <span className="w-6 h-6 bg-gray-200 rounded-full" />
                )}
                <div>
                  <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                    {tx.description}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDate(tx.date)}
                    {tx.category && ` · ${tx.category.name}`}
                  </p>
                </div>
              </div>
              <span
                className={`text-sm font-semibold ${
                  isExpense ? 'text-red-600' : 'text-green-600'
                }`}
              >
                {isExpense ? '' : '+'}{formatCurrency(Math.abs(amount))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
