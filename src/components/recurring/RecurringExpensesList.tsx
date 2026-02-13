'use client';

import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { SummaryCard } from '@/components/dashboard/SummaryCard';
import { Repeat, X } from 'lucide-react';
import { showToast } from '@/components/ui/Toast';
import { isLikelySameMerchant } from '@/lib/merchantSimilarity';

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

type AmountStrategy = 'max' | 'avg';

interface RecurringCluster {
  key: string;
  categoryKey: string;
  representativeId: string;
  description: string;
  categoryId: string | null;
  category: Transaction['category'];
  lastDate: string;
  occurrences: number;
  amountSum: number;
  amountMin: number;
  amountMax: number;
  transactionIds: string[];
}

interface RecurringItem {
  key: string;
  categoryKey: string;
  representativeId: string;
  description: string;
  categoryId: string | null;
  category: Transaction['category'];
  lastDate: string;
  occurrences: number;
  averageAmount: number;
  minAmount: number;
  maxAmount: number;
  monthlyAmount: number;
  transactionIds: string[];
}

function parseAbsAmount(amountValue: string): number {
  const parsed = parseFloat(amountValue);
  if (!Number.isFinite(parsed)) return 0;
  return Math.abs(parsed);
}

function getMonthlyAmount(cluster: RecurringCluster, strategy: AmountStrategy): number {
  if (strategy === 'avg') {
    return cluster.occurrences > 0 ? cluster.amountSum / cluster.occurrences : cluster.amountMax;
  }
  return cluster.amountMax;
}

export function RecurringExpensesList({
  transactions: initialTransactions,
  averageMonthlyIncome,
  incomeMonths
}: RecurringExpensesListProps) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [amountStrategy, setAmountStrategy] = useState<AmountStrategy>('max');

  const recurringClusters = useMemo(() => {
    const clusters: RecurringCluster[] = [];
    const expenseTransactions = transactions
      .filter((tx) => parseFloat(tx.amount) < 0)
      .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());

    for (const tx of expenseTransactions) {
      const amount = parseAbsAmount(tx.amount);
      const categoryKey = tx.categoryId || 'uncategorized';

      const cluster = clusters.find((existing) =>
        existing.categoryKey === categoryKey
        && isLikelySameMerchant(existing.description, tx.description)
      );

      if (!cluster) {
        clusters.push({
          key: `${categoryKey}|${tx.id}`,
          categoryKey,
          representativeId: tx.id,
          description: tx.description,
          categoryId: tx.categoryId,
          category: tx.category,
          lastDate: tx.date,
          occurrences: 1,
          amountSum: amount,
          amountMin: amount,
          amountMax: amount,
          transactionIds: [tx.id],
        });
        continue;
      }

      cluster.occurrences += 1;
      cluster.amountSum += amount;
      cluster.amountMin = Math.min(cluster.amountMin, amount);
      cluster.amountMax = Math.max(cluster.amountMax, amount);
      cluster.transactionIds.push(tx.id);

      if (dayjs(tx.date).isAfter(cluster.lastDate)) {
        cluster.lastDate = tx.date;
        cluster.representativeId = tx.id;
        cluster.description = tx.description;
        cluster.categoryId = tx.categoryId;
        cluster.category = tx.category;
      }
    }

    return clusters;
  }, [transactions]);

  const recurringItems = useMemo(() => {
    return recurringClusters
      .map<RecurringItem>((cluster) => ({
        key: cluster.key,
        categoryKey: cluster.categoryKey,
        representativeId: cluster.representativeId,
        description: cluster.description,
        categoryId: cluster.categoryId,
        category: cluster.category,
        lastDate: cluster.lastDate,
        occurrences: cluster.occurrences,
        averageAmount: cluster.occurrences > 0 ? cluster.amountSum / cluster.occurrences : cluster.amountMax,
        minAmount: cluster.amountMin,
        maxAmount: cluster.amountMax,
        monthlyAmount: getMonthlyAmount(cluster, amountStrategy),
        transactionIds: cluster.transactionIds,
      }))
      .sort((a, b) => b.monthlyAmount - a.monthlyAmount);
  }, [recurringClusters, amountStrategy]);

  const groupedByCategory = useMemo(() => {
    const groups: Record<string, { category: Transaction['category']; items: RecurringItem[]; total: number }> = {};

    for (const item of recurringItems) {
      if (!groups[item.categoryKey]) {
        groups[item.categoryKey] = {
          category: item.category,
          items: [],
          total: 0,
        };
      }
      groups[item.categoryKey].items.push(item);
      groups[item.categoryKey].total += item.monthlyAmount;
    }

    return Object.entries(groups).sort(([, a], [, b]) => b.total - a.total);
  }, [recurringItems]);

  const monthlyFixedTotal = recurringItems.reduce((sum, item) => sum + item.monthlyAmount, 0);
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
          applyToMerchantFamily: true,
        }),
      });
      if (!response.ok) throw new Error('Failed');

      const result = await response.json();
      const idsToRemove = new Set<string>(item.transactionIds);

      if (Array.isArray(result.updatedMerchantFamilyIds)) {
        for (const txId of result.updatedMerchantFamilyIds as string[]) {
          idsToRemove.add(txId);
        }
      }
      idsToRemove.add(item.representativeId);

      setTransactions((prev) => prev.filter((tx) => !idsToRemove.has(tx.id)));

      const removedCount = Math.max(1, idsToRemove.size);
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

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="text-sm text-gray-500">
          חישוב &quot;נשאר למשתנות&quot; מבוסס על ממוצע הכנסות חודשי של {incomeMonths} חודשים.
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="fixed-amount-strategy" className="text-sm text-gray-600 whitespace-nowrap">
            חישוב התחייבות:
          </label>
          <select
            id="fixed-amount-strategy"
            value={amountStrategy}
            onChange={(event) => setAmountStrategy(event.target.value as AmountStrategy)}
            className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="max">לפי הגבוה ביותר (מומלץ)</option>
            <option value="avg">לפי ממוצע</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm">
        <div className="p-4 border-b bg-gray-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
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
                  <div className={`p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${isUncategorized ? 'bg-orange-50' : 'bg-gray-50'}`}>
                    <div className="flex items-center gap-3 min-w-0">
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
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900">
                          {data.category?.name || 'לא מסווג'}
                        </h3>
                        <p className="text-sm text-gray-500">{data.items.length} התחייבויות קבועות</p>
                      </div>
                    </div>
                    <div className="text-left self-end sm:self-auto">
                      <p className="text-xl font-bold text-red-600">{formatCurrency(data.total)}</p>
                    </div>
                  </div>

                  <div className="divide-y divide-gray-100">
                    {data.items.map((item) => (
                      <div key={item.key} className="group px-4 py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 hover:bg-gray-50">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <Repeat className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 break-words">{item.description}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              חיוב אחרון: {formatDate(item.lastDate)} | הופיע {item.occurrences} פעמים בהיסטוריה
                            </p>
                            {item.occurrences > 1 && item.minAmount !== item.maxAmount && (
                              <p className="text-xs text-gray-500 mt-0.5">
                                ממוצע: {formatCurrency(item.averageAmount)} | טווח: {formatCurrency(item.minAmount)}-{formatCurrency(item.maxAmount)}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0 self-end sm:self-auto">
                          <span className="text-sm font-semibold text-red-600">
                            {formatCurrency(item.monthlyAmount)}
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
          <div className="p-4 border-t bg-gray-50 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
            <span className="text-sm text-gray-600">{fixedCategoriesCount} קטגוריות קבועות</span>
            <span className="text-sm">
              <span className="text-gray-500">סה״כ התחייבות חודשית ({amountStrategy === 'max' ? 'לפי הגבוה' : 'לפי ממוצע'}): </span>
              <span className="font-semibold text-red-600">{formatCurrency(monthlyFixedTotal)}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
