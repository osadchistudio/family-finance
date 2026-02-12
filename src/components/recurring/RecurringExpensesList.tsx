'use client';

import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { SummaryCard } from '@/components/dashboard/SummaryCard';
import { Repeat, X } from 'lucide-react';
import { showToast } from '@/components/ui/Toast';

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: string;
  categoryId: string | null;
  category: {
    id: string;
    name: string;
    icon: string;
    color: string;
  } | null;
  account: {
    id: string;
    name: string;
    institution: string;
  };
  isRecurring: boolean;
  notes: string | null;
}

interface RecurringExpensesListProps {
  transactions: Transaction[];
  averageMonthlyIncome: number;
  incomeMonths: number;
}

interface RecurringItem {
  key: string;
  representativeId: string;
  description: string;
  amount: number;
  categoryId: string | null;
  category: Transaction['category'];
  lastDate: string;
  occurrences: number;
}

function normalizeDescription(description: string): string {
  return description.toLowerCase().trim().replace(/\s+/g, ' ');
}

function getRecurringItemKey(tx: Transaction): string {
  const categoryKey = tx.categoryId || 'uncategorized';
  const amountAbs = Math.abs(parseFloat(tx.amount)).toFixed(2);
  return `${categoryKey}|${normalizeDescription(tx.description)}|${amountAbs}`;
}

export function RecurringExpensesList({
  transactions: initialTransactions,
  averageMonthlyIncome,
  incomeMonths
}: RecurringExpensesListProps) {
  const [transactions, setTransactions] = useState(initialTransactions);

  const recurringItems = useMemo(() => {
    const itemsByKey = new Map<string, RecurringItem>();

    for (const tx of transactions) {
      const amount = parseFloat(tx.amount);
      if (!Number.isFinite(amount) || amount >= 0) continue;

      const key = getRecurringItemKey(tx);
      const existing = itemsByKey.get(key);

      if (!existing) {
        itemsByKey.set(key, {
          key,
          representativeId: tx.id,
          description: tx.description,
          amount: Math.abs(amount),
          categoryId: tx.categoryId,
          category: tx.category,
          lastDate: tx.date,
          occurrences: 1
        });
        continue;
      }

      existing.occurrences += 1;
      if (dayjs(tx.date).isAfter(existing.lastDate)) {
        existing.lastDate = tx.date;
        existing.representativeId = tx.id;
        existing.description = tx.description;
        existing.categoryId = tx.categoryId;
        existing.category = tx.category;
      }
    }

    return Array.from(itemsByKey.values()).sort((a, b) => b.amount - a.amount);
  }, [transactions]);

  const groupedByCategory = useMemo(() => {
    const groups: Record<string, { category: Transaction['category']; items: RecurringItem[]; total: number }> = {};

    for (const item of recurringItems) {
      const categoryKey = item.categoryId || 'uncategorized';
      if (!groups[categoryKey]) {
        groups[categoryKey] = {
          category: item.category,
          items: [],
          total: 0
        };
      }
      groups[categoryKey].items.push(item);
      groups[categoryKey].total += item.amount;
    }

    return Object.entries(groups).sort(([, a], [, b]) => b.total - a.total);
  }, [recurringItems]);

  const monthlyFixedTotal = recurringItems.reduce((sum, item) => sum + item.amount, 0);
  const fixedCategoriesCount = groupedByCategory.length;
  const remainingForVariable = averageMonthlyIncome - monthlyFixedTotal;

  const handleRemoveRecurringItem = async (item: RecurringItem) => {
    try {
      const response = await fetch(`/api/transactions/${item.representativeId}/recurring`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isRecurring: false,
          learnFromThis: false,
          applyToIdentical: true
        }),
      });
      if (!response.ok) throw new Error('Failed');

      const result = await response.json();
      const removedCount = (result.updatedIdentical || 0) + 1;

      setTransactions(prev => prev.filter(tx => getRecurringItemKey(tx) !== item.key));
      showToast(`הוסר מהוצאות קבועות (${removedCount} תנועות)`, 'success');
    } catch {
      showToast('שגיאה בעדכון', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard
          title="סה״כ התחייבות חודשית"
          value={monthlyFixedTotal}
          type="expense"
        />
        <SummaryCard
          title="נשאר למשתנות"
          value={remainingForVariable}
          type={remainingForVariable >= 0 ? 'income' : 'expense'}
        />
        <SummaryCard
          title="מספר התחייבויות קבועות"
          value={recurringItems.length}
          type="balance"
          format="number"
        />
        <SummaryCard
          title="מספר קטגוריות קבועות"
          value={fixedCategoriesCount}
          type="balance"
          format="number"
        />
      </div>

      <div className="text-sm text-gray-500">
        חישוב &quot;נשאר למשתנות&quot; מבוסס על ממוצע הכנסות חודשי של {incomeMonths} חודשים.
      </div>

      <div className="bg-white rounded-xl shadow-sm">
        <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">פירוט התחייבויות קבועות חודשיות</h2>
          <span className="text-sm text-gray-600">{recurringItems.length} התחייבויות</span>
        </div>

        <div className="p-4 space-y-4">
          {groupedByCategory.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Repeat className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="text-lg font-medium">אין הוצאות קבועות</p>
              <p className="text-sm mt-1">
                סמן תנועות כהוצאות קבועות בדף התנועות באמצעות אייקון ה-🔄
              </p>
            </div>
          ) : (
            groupedByCategory.map(([categoryKey, data]) => {
              const isUncategorized = categoryKey === 'uncategorized';

              return (
                <div key={categoryKey} className="border rounded-lg overflow-hidden">
                  <div className={`p-4 flex items-center justify-between ${isUncategorized ? 'bg-orange-50' : 'bg-gray-50'}`}>
                    <div className="flex items-center gap-3">
                      {data.category ? (
                        <span
                          className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
                          style={{ backgroundColor: `${data.category.color}30` }}
                        >
                          {data.category.icon}
                        </span>
                      ) : (
                        <span className="w-10 h-10 rounded-full flex items-center justify-center text-xl bg-orange-100">
                          ❓
                        </span>
                      )}
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {data.category?.name || 'לא מסווג'}
                        </h3>
                        <p className="text-sm text-gray-500">{data.items.length} התחייבויות קבועות</p>
                      </div>
                    </div>
                    <div className="text-left">
                      <p className="text-xl font-bold text-red-600">{formatCurrency(data.total)}</p>
                    </div>
                  </div>

                  <div className="divide-y divide-gray-100">
                    {data.items.map((item) => (
                      <div key={item.key} className="group px-4 py-3 flex items-start justify-between hover:bg-gray-50">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <Repeat className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 truncate">{item.description}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              חיוב אחרון: {formatDate(item.lastDate)} | הופיע {item.occurrences} פעמים בהיסטוריה
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-sm font-semibold text-red-600">
                            {formatCurrency(item.amount)}
                          </span>
                          <button
                            onClick={() => handleRemoveRecurringItem(item)}
                            className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                            title="הסר מהוצאות קבועות"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {recurringItems.length > 0 && (
          <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
            <span className="text-sm text-gray-600">{fixedCategoriesCount} קטגוריות קבועות</span>
            <span className="text-sm">
              <span className="text-gray-500">סה״כ התחייבות חודשית: </span>
              <span className="font-semibold text-red-600">{formatCurrency(monthlyFixedTotal)}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
