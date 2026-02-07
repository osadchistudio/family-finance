'use client';

import { useState, useMemo } from 'react';
import { formatCurrency, formatDate, getHebrewMonthName } from '@/lib/formatters';
import { SummaryCard } from '@/components/dashboard/SummaryCard';
import { Repeat, X, MessageSquare, ChevronRight, ChevronLeft, CalendarDays } from 'lucide-react';
import { showToast } from '@/components/ui/Toast';
import dayjs from 'dayjs';

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

interface Category {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
}

interface RecurringExpensesListProps {
  transactions: Transaction[];
  categories: Category[];
}

export function RecurringExpensesList({ transactions: initialTransactions, categories }: RecurringExpensesListProps) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  // Compute available months
  const availableMonths = useMemo(() => {
    const monthSet = new Set<string>();
    for (const tx of transactions) {
      monthSet.add(dayjs(tx.date).format('YYYY-MM'));
    }
    return Array.from(monthSet).sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  const currentMonthIndex = selectedMonth ? availableMonths.indexOf(selectedMonth) : -1;

  const goToPrevMonth = () => {
    if (!selectedMonth) {
      if (availableMonths.length > 0) setSelectedMonth(availableMonths[0]);
    } else if (currentMonthIndex < availableMonths.length - 1) {
      setSelectedMonth(availableMonths[currentMonthIndex + 1]);
    }
  };

  const goToNextMonth = () => {
    if (selectedMonth && currentMonthIndex > 0) {
      setSelectedMonth(availableMonths[currentMonthIndex - 1]);
    } else if (selectedMonth && currentMonthIndex === 0) {
      setSelectedMonth('');
    }
  };

  const getMonthLabel = (monthKey: string) => {
    const d = dayjs(monthKey + '-01');
    return `${getHebrewMonthName(d.month())} ${d.year()}`;
  };

  // Filter by month
  const filteredTransactions = selectedMonth
    ? transactions.filter(tx => dayjs(tx.date).format('YYYY-MM') === selectedMonth)
    : transactions;

  // Group by category
  const groupedByCategory = useMemo(() => {
    const groups: Record<string, { category: Transaction['category']; transactions: Transaction[]; total: number }> = {};

    for (const tx of filteredTransactions) {
      const key = tx.categoryId || 'uncategorized';
      if (!groups[key]) {
        groups[key] = { category: tx.category, transactions: [], total: 0 };
      }
      groups[key].transactions.push(tx);
      groups[key].total += parseFloat(tx.amount);
    }

    return Object.entries(groups).sort(([, a], [, b]) => a.total - b.total);
  }, [filteredTransactions]);

  // Summary stats
  const totalExpenses = filteredTransactions
    .filter(tx => parseFloat(tx.amount) < 0)
    .reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount)), 0);

  const uniqueExpenses = new Set(
    filteredTransactions
      .filter(tx => parseFloat(tx.amount) < 0)
      .map(tx => tx.description.toLowerCase().trim())
  ).size;

  // --- Handlers ---
  const startEditingNote = (id: string, currentNote: string | null) => {
    setEditingNoteId(id);
    setNoteValue(currentNote || '');
  };

  const handleNoteSave = async (transactionId: string) => {
    try {
      await fetch(`/api/transactions/${transactionId}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: noteValue.trim() || null }),
      });
      setTransactions(prev => prev.map(tx =>
        tx.id === transactionId ? { ...tx, notes: noteValue.trim() || null } : tx
      ));
      showToast('הערה נשמרה', 'success');
    } catch {
      showToast('שגיאה בשמירת הערה', 'error');
    } finally {
      setEditingNoteId(null);
    }
  };

  const handleRemoveRecurring = async (transactionId: string) => {
    try {
      const response = await fetch(`/api/transactions/${transactionId}/recurring`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRecurring: false, learnFromThis: false }),
      });
      if (!response.ok) throw new Error('Failed');

      setTransactions(prev => prev.filter(tx => tx.id !== transactionId));
      showToast('הוסר מהוצאות קבועות', 'success');
    } catch {
      showToast('שגיאה בעדכון', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SummaryCard
          title="סה״כ הוצאות קבועות"
          value={totalExpenses}
          type="expense"
        />
        <SummaryCard
          title="מספר הוצאות קבועות"
          value={uniqueExpenses}
          type="balance"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm">
        {/* Month Navigation */}
        {availableMonths.length > 0 && (
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={goToPrevMonth}
                disabled={!selectedMonth && availableMonths.length === 0 || (selectedMonth !== '' && currentMonthIndex >= availableMonths.length - 1)}
                className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-5 w-5 text-gray-600" />
              </button>
              <div className="flex items-center gap-2 min-w-[160px] justify-center">
                <CalendarDays className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-semibold text-gray-800">
                  {selectedMonth ? getMonthLabel(selectedMonth) : 'כל החודשים'}
                </span>
              </div>
              <button
                onClick={goToNextMonth}
                disabled={!selectedMonth}
                className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-5 w-5 text-gray-600" />
              </button>
            </div>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">כל החודשים</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>{getMonthLabel(m)}</option>
              ))}
            </select>
          </div>
        )}

        {/* Grouped by category */}
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
              const isExpense = data.total < 0;
              const isUncategorized = categoryKey === 'uncategorized';

              return (
                <div key={categoryKey} className="border rounded-lg overflow-hidden">
                  {/* Category Header */}
                  <div className={`p-4 flex items-center justify-between ${
                    isUncategorized ? 'bg-orange-50' : 'bg-gray-50'
                  }`}>
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
                        <p className="text-sm text-gray-500">
                          {data.transactions.length} הוצאות קבועות
                        </p>
                      </div>
                    </div>
                    <div className="text-left">
                      <p className={`text-xl font-bold ${isExpense ? 'text-red-600' : 'text-green-600'}`}>
                        {isExpense ? '' : '+'}{formatCurrency(Math.abs(data.total))}
                      </p>
                    </div>
                  </div>

                  {/* Transactions */}
                  <div className="divide-y divide-gray-100">
                    {data.transactions.map(tx => {
                      const amount = parseFloat(tx.amount);
                      const txIsExpense = amount < 0;

                      return (
                        <div key={tx.id} className="group px-4 py-3 flex items-start justify-between hover:bg-gray-50">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <Repeat className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900 truncate">
                                  {tx.description}
                                </span>
                                <span className="text-xs text-gray-400 flex-shrink-0">
                                  {formatDate(tx.date)}
                                </span>
                              </div>
                              {/* Note */}
                              {editingNoteId === tx.id ? (
                                <input
                                  type="text"
                                  value={noteValue}
                                  onChange={(e) => setNoteValue(e.target.value)}
                                  onBlur={() => handleNoteSave(tx.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleNoteSave(tx.id);
                                    if (e.key === 'Escape') setEditingNoteId(null);
                                  }}
                                  className="mt-0.5 text-xs text-gray-500 border-b border-gray-300 focus:border-blue-500 outline-none w-full bg-transparent"
                                  autoFocus
                                  placeholder="הוסף הערה..."
                                />
                              ) : (
                                <p
                                  className="mt-0.5 text-xs text-gray-400 cursor-pointer hover:text-gray-600 flex items-center gap-1"
                                  onClick={() => startEditingNote(tx.id, tx.notes)}
                                >
                                  {tx.notes ? (
                                    <>{tx.notes}</>
                                  ) : (
                                    <span className="opacity-0 group-hover:opacity-100">
                                      <MessageSquare className="h-3 w-3 inline" /> הוסף הערה
                                    </span>
                                  )}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className={`text-sm font-semibold ${txIsExpense ? 'text-red-600' : 'text-green-600'}`}>
                              {txIsExpense ? '' : '+'}{formatCurrency(Math.abs(amount))}
                            </span>
                            <button
                              onClick={() => handleRemoveRecurring(tx.id)}
                              className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                              title="הסר מהוצאות קבועות"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Summary footer */}
        {filteredTransactions.length > 0 && (
          <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
            <span className="text-sm text-gray-600">
              {filteredTransactions.length} הוצאות קבועות
            </span>
            <span className="text-sm">
              <span className="text-gray-500">סה״כ: </span>
              <span className="font-semibold text-red-600">
                {formatCurrency(totalExpenses)}
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
