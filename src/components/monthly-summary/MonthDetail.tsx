'use client';

import { useState, useEffect } from 'react';
import { SummaryCard } from '@/components/dashboard/SummaryCard';
import { CategoryPieChart } from '@/components/dashboard/CategoryPieChart';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { ArrowRight, Loader2 } from 'lucide-react';
import dayjs from 'dayjs';
import { MonthSummaryData } from './MonthCard';

interface TransactionItem {
  id: string;
  date: string;
  description: string;
  amount: string;
  category: { name: string; icon: string; color: string } | null;
  account: { name: string; institution: string } | null;
}

interface MonthDetailProps {
  data: MonthSummaryData;
  categoryBreakdown: { id: string; name: string; value: number; color: string; icon: string }[];
  onBack: () => void;
}

export function MonthDetail({ data, categoryBreakdown, onBack }: MonthDetailProps) {
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const startDate = data.periodStart;
  const endDate = data.periodEnd;
  const periodDisplay = `${dayjs(startDate).format('DD/MM/YYYY')} - ${dayjs(endDate).format('DD/MM/YYYY')}`;

  useEffect(() => {
    async function fetchTransactions() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/transactions?startDate=${startDate}&endDate=${endDate}&limit=500`
        );
        const json = await res.json();
        setTransactions(
          json.transactions.map((tx: Record<string, unknown>) => ({
            id: tx.id as string,
            date: tx.date as string,
            description: tx.description as string,
            amount: String(tx.amount),
            category: tx.category
              ? {
                  name: (tx.category as Record<string, string>).name,
                  icon: (tx.category as Record<string, string>).icon || '',
                  color: (tx.category as Record<string, string>).color || '#888',
                }
              : null,
            account: tx.account
              ? {
                  name: (tx.account as Record<string, string>).name,
                  institution: (tx.account as Record<string, string>).institution,
                }
              : null,
          }))
        );
        setTotal(json.total);
      } catch (err) {
        console.error('Error fetching transactions:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchTransactions();
  }, [startDate, endDate]);

  const savingsRate = data.income > 0
    ? ((data.balance / data.income) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ArrowRight className="h-5 w-5 text-gray-600" />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {data.label}
          </h2>
          <p className="text-gray-500 text-sm">{data.subLabel} · {periodDisplay} · {data.transactionCount} תנועות</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard title="הכנסות" value={data.income} type="income" />
        <SummaryCard title="הוצאות" value={data.expense} type="expense" />
        <SummaryCard title="יתרה" value={data.balance} type="balance" />
        <SummaryCard
          title="אחוז חיסכון"
          value={Math.max(0, data.balance)}
          type="savings"
          trend={savingsRate}
        />
      </div>

      {/* Category breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CategoryPieChart data={categoryBreakdown} />

        {/* Top categories list */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            קטגוריות מובילות
          </h3>
          <div className="space-y-3">
            {categoryBreakdown.slice(0, 8).map((cat) => {
              const pct = data.expense > 0
                ? ((cat.value / data.expense) * 100).toFixed(1)
                : '0';
              return (
                <div key={cat.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="text-sm text-gray-700">
                      {cat.icon} {cat.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-900">
                      {formatCurrency(cat.value)}
                    </span>
                    <span className="text-xs text-gray-400 w-12 text-left">
                      {pct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Transactions list */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          תנועות בחודש ({total})
        </h3>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            אין תנועות בחודש זה
          </div>
        ) : (
          <div className="space-y-3">
            <div className="md:hidden space-y-2">
              {transactions.map((tx) => {
                const amount = parseFloat(tx.amount);
                const isIncome = amount >= 0;

                return (
                  <div key={tx.id} className="border border-gray-100 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 break-words">{tx.description}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{formatDate(tx.date)} · {tx.account?.name || '-'}</p>
                      </div>
                      <span className={`text-sm font-semibold whitespace-nowrap ${isIncome ? 'text-green-600' : 'text-red-600'}`}>
                        {isIncome ? '+' : '-'}{formatCurrency(Math.abs(amount))}
                      </span>
                    </div>
                    <div className="mt-2">
                      {tx.category ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                          style={{
                            backgroundColor: tx.category.color + '20',
                            color: tx.category.color,
                          }}
                        >
                          {tx.category.icon} {tx.category.name}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">ללא קטגוריה</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="text-right py-3 px-2 font-medium">תאריך</th>
                    <th className="text-right py-3 px-2 font-medium">תיאור</th>
                    <th className="text-right py-3 px-2 font-medium">קטגוריה</th>
                    <th className="text-right py-3 px-2 font-medium">חשבון</th>
                    <th className="text-left py-3 px-2 font-medium">סכום</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => {
                    const amount = parseFloat(tx.amount);
                    return (
                      <tr key={tx.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-3 px-2 text-gray-600">
                          {formatDate(tx.date)}
                        </td>
                        <td className="py-3 px-2 text-gray-900 font-medium max-w-[200px] truncate">
                          {tx.description}
                        </td>
                        <td className="py-3 px-2">
                          {tx.category ? (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                              style={{
                                backgroundColor: tx.category.color + '20',
                                color: tx.category.color,
                              }}
                            >
                              {tx.category.icon} {tx.category.name}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">ללא קטגוריה</span>
                          )}
                        </td>
                        <td className="py-3 px-2 text-gray-500 text-xs">
                          {tx.account?.name || '-'}
                        </td>
                        <td className={`py-3 px-2 font-semibold text-left ${
                          amount >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {formatCurrency(Math.abs(amount))}
                          {amount >= 0 ? '+' : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
