'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { formatCurrency, formatDate, getHebrewMonthName } from '@/lib/formatters';
import { Search, LayoutList, PieChart, Wand2, Loader2, Layers, ChevronRight, ChevronLeft, CalendarDays, Repeat, MessageSquare, ChevronDown, ChevronUp, Trash2, X } from 'lucide-react';
import { CategorySelector } from './CategorySelector';
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
  isAutoCategorized: boolean;
  isRecurring: boolean;
  notes: string | null;
}

interface Category {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
}

interface ApiCategory {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
}

interface Account {
  id: string;
  name: string;
  institution: string;
  cardNumber: string | null;
}

interface TransactionListProps {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
}

type ViewMode = 'list' | 'byCategory' | 'grouped';
type AmountTypeFilter = 'all' | 'expense' | 'income';

interface GroupedTransaction {
  description: string;
  transactions: Transaction[];
  totalAmount: number;
  count: number;
  category: Transaction['category'];
  categoryId: string | null;
  firstTransactionId: string;
  dates: string[];
}

const AMOUNT_MATCH_EPSILON = 0.01;

interface ParsedAmountSearch {
  value: number;
  hasFraction: boolean;
}

function parseAmountSearchTerm(searchTerm: string): ParsedAmountSearch | null {
  const trimmed = searchTerm.trim();
  if (!trimmed || !/\d/.test(trimmed)) return null;

  // If query contains letters, treat it as text search only.
  if (/[A-Za-z\u0590-\u05FF]/.test(trimmed)) return null;

  const normalized = trimmed
    .replace(/[₪,\s]/g, '')
    .replace(/[()]/g, '')
    .replace(/^\+/, '');

  const parsed = Math.abs(parseFloat(normalized));
  if (!Number.isFinite(parsed) || parsed === 0) return null;

  return {
    value: parsed,
    hasFraction: normalized.includes('.'),
  };
}

function matchesAmountValue(amount: string, search: ParsedAmountSearch): boolean {
  const numericAmount = parseFloat(amount);
  if (!Number.isFinite(numericAmount)) return false;

  const absoluteAmount = Math.abs(numericAmount);

  if (search.hasFraction) {
    return Math.abs(absoluteAmount - search.value) < AMOUNT_MATCH_EPSILON;
  }

  // UI displays rounded whole shekels, so integer search should match that view.
  return Math.round(absoluteAmount) === Math.round(search.value)
    || Math.abs(absoluteAmount - search.value) < AMOUNT_MATCH_EPSILON;
}

export function TransactionList({ transactions: initialTransactions, categories: initialCategories, accounts }: TransactionListProps) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [categories, setCategories] = useState(initialCategories);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [selectedAmountType, setSelectedAmountType] = useState<AmountTypeFilter>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>(''); // '' = all, 'YYYY-MM' = specific
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [isAutoCategorizing, setIsAutoCategorizing] = useState(false);
  const [autoCategorizingTxId, setAutoCategorizingTxId] = useState<string | null>(null);
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Notes inline editing
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState('');

  // Expanded categories in byCategory view
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;

    const syncCategories = async () => {
      try {
        const response = await fetch('/api/categories', { cache: 'no-store' });
        if (!response.ok) return;

        const payload = await response.json();
        if (!Array.isArray(payload)) return;

        const normalized: Category[] = (payload as ApiCategory[]).map(cat => ({
          id: cat.id,
          name: cat.name,
          icon: cat.icon || '📁',
          color: cat.color || '#6B7280',
        }));

        if (active) {
          setCategories(normalized);
        }
      } catch {
        // Ignore category sync errors and keep existing list.
      }
    };

    void syncCategories();

    const onFocus = () => {
      void syncCategories();
    };

    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const toggleCategoryExpanded = (categoryKey: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryKey)) {
        newSet.delete(categoryKey);
      } else {
        newSet.add(categoryKey);
      }
      return newSet;
    });
  };

  // Compute available months from transactions (sorted newest first)
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
      // From "all" go to newest month
      if (availableMonths.length > 0) setSelectedMonth(availableMonths[0]);
    } else if (currentMonthIndex < availableMonths.length - 1) {
      setSelectedMonth(availableMonths[currentMonthIndex + 1]);
    }
  };

  const goToNextMonth = () => {
    if (selectedMonth && currentMonthIndex > 0) {
      setSelectedMonth(availableMonths[currentMonthIndex - 1]);
    } else if (selectedMonth && currentMonthIndex === 0) {
      // Already at newest month — could go to "all"
      setSelectedMonth('');
    }
  };

  const getMonthLabel = (monthKey: string) => {
    const d = dayjs(monthKey + '-01');
    return `${getHebrewMonthName(d.month())} ${d.year()}`;
  };

  const uncategorizedCount = transactions.filter(tx => !tx.categoryId).length;
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const amountSearch = parseAmountSearchTerm(searchTerm);

  const filteredTransactions = transactions.filter(tx => {
    const txAmount = parseFloat(tx.amount);
    const matchesTextSearch = !normalizedSearchTerm || tx.description.toLowerCase().includes(normalizedSearchTerm);
    const matchesAmountSearch = amountSearch !== null && matchesAmountValue(tx.amount, amountSearch);
    const matchesSearch = !normalizedSearchTerm || matchesTextSearch || matchesAmountSearch;
    const matchesCategory = !selectedCategory ||
      (selectedCategory === 'uncategorized' ? !tx.categoryId : tx.categoryId === selectedCategory);
    const matchesAccount = !selectedAccount || tx.account.id === selectedAccount;
    const matchesAmountType = selectedAmountType === 'all'
      || (selectedAmountType === 'expense' && txAmount < 0)
      || (selectedAmountType === 'income' && txAmount > 0);
    const matchesMonth = !selectedMonth || dayjs(tx.date).format('YYYY-MM') === selectedMonth;
    return matchesSearch && matchesCategory && matchesAccount && matchesAmountType && matchesMonth;
  });

  // Group transactions by description for grouped view
  const groupedTransactions = useMemo(() => {
    const groups: Record<string, GroupedTransaction> = {};

    for (const tx of filteredTransactions) {
      const key = tx.description.toLowerCase().trim();

      if (!groups[key]) {
        groups[key] = {
          description: tx.description,
          transactions: [],
          totalAmount: 0,
          count: 0,
          category: tx.category,
          categoryId: tx.categoryId,
          firstTransactionId: tx.id,
          dates: [],
        };
      }

      groups[key].transactions.push(tx);
      groups[key].totalAmount += parseFloat(tx.amount);
      groups[key].count++;
      groups[key].dates.push(tx.date);

      // Use most recent category if available
      if (tx.category && !groups[key].category) {
        groups[key].category = tx.category;
        groups[key].categoryId = tx.categoryId;
      }
    }

    // Sort by total amount (expenses first, largest first)
    return Object.values(groups).sort((a, b) => a.totalAmount - b.totalAmount);
  }, [filteredTransactions]);

  // Group transactions by category for the category view
  const groupedByCategory = filteredTransactions.reduce((acc, tx) => {
    const categoryKey = tx.categoryId || 'uncategorized';
    if (!acc[categoryKey]) {
      acc[categoryKey] = {
        category: tx.category,
        transactions: [],
        total: 0,
      };
    }
    acc[categoryKey].transactions.push(tx);
    acc[categoryKey].total += parseFloat(tx.amount);
    return acc;
  }, {} as Record<string, { category: Transaction['category']; transactions: Transaction[]; total: number }>);

  // Sort categories by total (expenses first, largest first)
  const sortedCategories = Object.entries(groupedByCategory)
    .sort(([, a], [, b]) => a.total - b.total);

  const handleAutoCategorize = async () => {
    if (isAutoCategorizing) return;

    setIsAutoCategorizing(true);
    showToast('מתחיל זיהוי אוטומטי...', 'info');

    try {
      const response = await fetch('/api/transactions/auto-categorize', {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to auto-categorize');

      const result = await response.json();

      if (result.categorized > 0) {
        showToast(`זוהו וסווגו ${result.categorized} עסקאות!`, 'learning');
        // Refresh the page to show updated data
        window.location.reload();
      } else {
        showToast('לא נמצאו עסקאות חדשות לסיווג', 'info');
      }
    } catch (error) {
      console.error('Auto-categorize error:', error);
      showToast('שגיאה בזיהוי אוטומטי', 'error');
    } finally {
      setIsAutoCategorizing(false);
    }
  };

  const handleCategoryChange = async (
    transactionId: string,
    categoryId: string,
    learnFromThis: boolean,
    applyToSimilar: boolean
  ) => {
    try {
      const response = await fetch(`/api/transactions/${transactionId}/category`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId, learnFromThis, applyToSimilar }),
      });

      if (!response.ok) throw new Error('Failed to update category');

      const result = await response.json();

      // Update local state
      const newCategory = categories.find(c => c.id === categoryId);
      const mappedCategory = newCategory ? {
        id: newCategory.id,
        name: newCategory.name,
        icon: newCategory.icon || '📁',
        color: newCategory.color || '#6B7280',
      } : null;
      const updatedSimilarIds = new Set<string>(
        Array.isArray(result.updatedSimilarIds) ? result.updatedSimilarIds : []
      );

      setTransactions(prev => {
        return prev.map(tx => {
          if (tx.id === transactionId || updatedSimilarIds.has(tx.id)) {
            return {
              ...tx,
              categoryId,
              category: mappedCategory,
            };
          }
          return tx;
        });
      });

      if (!applyToSimilar) {
        if (learnFromThis && result.keywordAdded) {
          showToast(`הקטגוריה עודכנה לתנועה הזו בלבד. למדתי "${result.keywordAdded}" להמשך`, 'learning');
        } else {
          showToast('הקטגוריה עודכנה לתנועה הזו בלבד', 'success');
        }
      } else if (learnFromThis && result.keywordAdded) {
        if (result.updatedSimilar > 0) {
          showToast(`למדתי! עודכנו ${result.updatedSimilar} עסקאות דומות`, 'learning');
        } else {
          showToast(`למדתי! אזהה "${result.keywordAdded}" בעתיד`, 'learning');
        }
      } else if (result.updatedSimilar > 0) {
        showToast(`הקטגוריה עודכנה. עודכנו גם ${result.updatedSimilar} עסקאות דומות`, 'success');
      } else {
        showToast('הקטגוריה עודכנה', 'success');
      }
    } catch (error) {
      console.error('Error updating category:', error);
      alert('שגיאה בעדכון הקטגוריה');
    }
  };

  // --- Notes handlers ---
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

  // --- Recurring toggle handler ---
  const handleToggleRecurring = async (transactionId: string, isRecurring: boolean) => {
    try {
      const response = await fetch(`/api/transactions/${transactionId}/recurring`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRecurring, learnFromThis: true }),
      });
      if (!response.ok) throw new Error('Failed');
      const result = await response.json();

      setTransactions(prev => prev.map(tx => {
        if (tx.id === transactionId) return { ...tx, isRecurring };
        // Cascade to similar descriptions if learning was applied
        if (result.updatedSimilar > 0 && isRecurring && result.keywordAdded) {
          const targetTx = prev.find(t => t.id === transactionId);
          if (targetTx && tx.description.toLowerCase().includes(result.keywordAdded)) {
            return { ...tx, isRecurring: true };
          }
        }
        return tx;
      }));

      if (isRecurring) {
        const msg = result.updatedSimilar > 0
          ? `סומן כהוצאה קבועה! עודכנו ${result.updatedSimilar} עסקאות דומות`
          : 'סומן כהוצאה קבועה';
        showToast(msg, 'learning');
      } else {
        showToast('הוסר מהוצאות קבועות', 'success');
      }
    } catch {
      showToast('שגיאה בעדכון', 'error');
    }
  };

  const handleDeleteTransaction = async (tx: Transaction) => {
    if (deletingTransactionId || autoCategorizingTxId) return;

    const amount = parseFloat(tx.amount);
    const amountText = formatCurrency(Math.abs(Number.isFinite(amount) ? amount : 0));
    const confirmed = window.confirm(
      `למחוק את התנועה?\n\n${tx.description}\n${amountText}\n${formatDate(tx.date)}`
    );
    if (!confirmed) return;

    setDeletingTransactionId(tx.id);
    try {
      const response = await fetch(`/api/transactions/${tx.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete transaction');

      setTransactions(prev => prev.filter(item => item.id !== tx.id));
      showToast('התנועה נמחקה', 'success');
    } catch {
      showToast('שגיאה במחיקת תנועה', 'error');
    } finally {
      setDeletingTransactionId(null);
    }
  };

  const handleAutoCategorizeSingle = async (tx: Transaction) => {
    if (autoCategorizingTxId || deletingTransactionId) return;

    setAutoCategorizingTxId(tx.id);
    try {
      const response = await fetch(`/api/transactions/${tx.id}/auto-categorize`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed');

      const result = await response.json();

      if (result.categorized && result.category) {
        const category = result.category as {
          id: string;
          name: string;
          icon: string;
          color: string;
        };

        const updatedSimilar = Number(result.updatedSimilar || 0);
        const updatedSimilarIds = new Set<string>(
          Array.isArray(result.updatedSimilarIds) ? result.updatedSimilarIds : []
        );

        setTransactions(prev => prev.map(item => {
          if (item.id === tx.id || updatedSimilarIds.has(item.id)) {
            return {
              ...item,
              categoryId: category.id,
              category,
              isAutoCategorized: true,
            };
          }
          return item;
        }));

        if (updatedSimilar > 0) {
          showToast(`סווג אוטומטית ל"${category.name}" ועודכנו גם ${updatedSimilar} תנועות דומות`, 'learning');
        } else {
          showToast(`סווג אוטומטית ל"${category.name}"`, 'learning');
        }
      } else {
        showToast(result.message || 'לא נמצאה קטגוריה מתאימה', 'info');
      }
    } catch {
      showToast('שגיאה בסיווג אוטומטי לתנועה', 'error');
    } finally {
      setAutoCategorizingTxId(null);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm">
      {/* Filters */}
      <div className="p-4 border-b flex flex-wrap items-stretch gap-3">
        <div className="w-full lg:flex-1 lg:min-w-[260px] relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          {searchTerm.trim() && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                searchInputRef.current?.focus();
              }}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              title="נקה חיפוש"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <input
            ref={searchInputRef}
            type="text"
            placeholder="חיפוש תנועות או סכום..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-10 pl-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="w-full sm:w-[180px]">
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">כל החשבונות</option>
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full sm:w-[180px]">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">כל הקטגוריות</option>
            <option value="uncategorized">ללא קטגוריה</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.icon} {cat.name}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full sm:w-[170px]">
          <select
            value={selectedAmountType}
            onChange={(e) => setSelectedAmountType(e.target.value as AmountTypeFilter)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">כל הסכומים</option>
            <option value="expense">רק הוצאות</option>
            <option value="income">רק הכנסות</option>
          </select>
        </div>

        {/* View mode toggle */}
        <div className="w-full sm:w-auto grid grid-cols-3 rounded-lg border border-gray-300 overflow-hidden">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-2 flex items-center justify-center gap-1 text-sm ${
              viewMode === 'list' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <LayoutList className="h-4 w-4" />
            רשימה
          </button>
          <button
            onClick={() => setViewMode('grouped')}
            className={`px-3 py-2 flex items-center justify-center gap-1 text-sm border-r ${
              viewMode === 'grouped' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Layers className="h-4 w-4" />
            מאוחד
          </button>
          <button
            onClick={() => setViewMode('byCategory')}
            className={`px-3 py-2 flex items-center justify-center gap-1 text-sm border-r ${
              viewMode === 'byCategory' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <PieChart className="h-4 w-4" />
            לפי קטגוריה
          </button>
        </div>

        {/* Auto-categorize button */}
        {uncategorizedCount > 0 && (
          <button
            onClick={handleAutoCategorize}
            disabled={isAutoCategorizing}
            className={`
              w-full sm:w-auto px-4 py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-medium
              transition-all
              ${isAutoCategorizing
                ? 'bg-purple-100 text-purple-400 cursor-not-allowed'
                : 'bg-purple-600 text-white hover:bg-purple-700 shadow-sm hover:shadow'
              }
            `}
          >
            {isAutoCategorizing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                מזהה עסקים...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                זהה וסווג אוטומטית ({uncategorizedCount})
              </>
            )}
          </button>
        )}

      </div>

      {/* Month Navigation */}
      {availableMonths.length > 0 && (
        <div className="px-4 py-3 border-b bg-gray-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center justify-between sm:justify-start gap-2">
            <button
              onClick={goToPrevMonth}
              disabled={!selectedMonth && availableMonths.length === 0 || (selectedMonth !== '' && currentMonthIndex >= availableMonths.length - 1)}
              className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="חודש קודם"
            >
              <ChevronRight className="h-5 w-5 text-gray-600" />
            </button>

            <div className="flex items-center gap-2 min-w-0 sm:min-w-[160px] justify-center flex-1 sm:flex-none">
              <CalendarDays className="h-4 w-4 text-gray-500" />
              {selectedMonth ? (
                <span className="text-sm font-semibold text-gray-800">
                  {getMonthLabel(selectedMonth)}
                </span>
              ) : (
                <span className="text-sm font-semibold text-gray-800">
                  כל החודשים
                </span>
              )}
            </div>

            <button
              onClick={goToNextMonth}
              disabled={!selectedMonth}
              className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="חודש הבא"
            >
              <ChevronLeft className="h-5 w-5 text-gray-600" />
            </button>
          </div>

          {/* Quick month selector */}
          <div className="w-full sm:w-auto">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full sm:w-auto text-sm px-3 py-1.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">כל החודשים</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>
                  {getMonthLabel(m)}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {viewMode === 'list' ? (
        <>
          <div className="md:hidden divide-y divide-gray-100">
            {filteredTransactions.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500">
                {transactions.length === 0
                  ? 'אין תנועות להצגה. העלה קבצי תנועות כדי להתחיל.'
                  : 'לא נמצאו תנועות התואמות לחיפוש'}
              </div>
            ) : (
              filteredTransactions.map((tx) => {
                const amount = parseFloat(tx.amount);
                const isExpense = amount < 0;

                return (
                  <div key={tx.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2 min-w-0">
                        <button
                          onClick={() => handleToggleRecurring(tx.id, !tx.isRecurring)}
                          className={`mt-0.5 p-1 rounded hover:bg-gray-100 transition-colors flex-shrink-0 ${
                            tx.isRecurring ? 'text-blue-600' : 'text-gray-300 hover:text-gray-500'
                          }`}
                          title={tx.isRecurring ? 'הוצאה קבועה — לחץ להסיר' : 'סמן כהוצאה קבועה'}
                        >
                          <Repeat className="h-4 w-4" />
                        </button>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 break-words">
                            {tx.description}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {formatDate(tx.date)} · {tx.account.name}
                          </p>
                        </div>
                      </div>
                      <span className={`text-sm font-semibold whitespace-nowrap ${isExpense ? 'text-red-600' : 'text-green-600'}`}>
                        {isExpense ? '' : '+'}{formatCurrency(Math.abs(amount))}
                      </span>
                    </div>

                    <div>
                      <CategorySelector
                        transactionId={tx.id}
                        transactionDescription={tx.description}
                        currentCategory={tx.category}
                        categories={categories as Category[]}
                        onCategoryChange={handleCategoryChange}
                      />
                    </div>

                    <div>
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
                          className="text-xs text-gray-500 border-b border-gray-300 focus:border-blue-500 outline-none w-full bg-transparent py-1"
                          autoFocus
                          placeholder="הוסף הערה..."
                        />
                      ) : (
                        <button
                          onClick={() => startEditingNote(tx.id, tx.notes)}
                          className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                        >
                          <MessageSquare className="h-3 w-3" />
                          {tx.notes || 'הוסף הערה'}
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleAutoCategorizeSingle(tx)}
                        disabled={autoCategorizingTxId === tx.id || deletingTransactionId !== null}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-purple-600 border border-purple-200 hover:bg-purple-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs"
                        title="AI: סווג רק את התנועה הזו"
                      >
                        {autoCategorizingTxId === tx.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Wand2 className="h-4 w-4" />
                        )}
                        AI
                      </button>
                      <button
                        onClick={() => handleDeleteTransaction(tx)}
                        disabled={deletingTransactionId === tx.id || autoCategorizingTxId !== null}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs"
                        title="מחק תנועה"
                      >
                        <Trash2 className="h-4 w-4" />
                        מחק
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">תאריך</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">תיאור</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">קטגוריה</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">חשבון</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">סכום</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-500">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      {transactions.length === 0
                        ? 'אין תנועות להצגה. העלה קבצי תנועות כדי להתחיל.'
                        : 'לא נמצאו תנועות התואמות לחיפוש'}
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((tx) => {
                    const amount = parseFloat(tx.amount);
                    const isExpense = amount < 0;

                    return (
                      <tr key={tx.id} className="group hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {formatDate(tx.date)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-2">
                            <button
                              onClick={() => handleToggleRecurring(tx.id, !tx.isRecurring)}
                              className={`mt-0.5 p-1 rounded hover:bg-gray-100 transition-colors flex-shrink-0 ${
                                tx.isRecurring ? 'text-blue-600' : 'text-gray-300 hover:text-gray-500'
                              }`}
                              title={tx.isRecurring ? 'הוצאה קבועה — לחץ להסיר' : 'סמן כהוצאה קבועה'}
                            >
                              <Repeat className="h-4 w-4" />
                            </button>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate max-w-[280px]">
                                {tx.description}
                              </p>
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
                                    <span className="opacity-0 group-hover:opacity-100 hover:!opacity-100">
                                      <MessageSquare className="h-3 w-3 inline" /> הוסף הערה
                                    </span>
                                  )}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <CategorySelector
                            transactionId={tx.id}
                            transactionDescription={tx.description}
                            currentCategory={tx.category}
                            categories={categories as Category[]}
                            onCategoryChange={handleCategoryChange}
                          />
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {tx.account.name}
                        </td>
                        <td className="px-4 py-3 text-left">
                          <span className={`text-sm font-semibold ${isExpense ? 'text-red-600' : 'text-green-600'}`}>
                            {isExpense ? '' : '+'}{formatCurrency(Math.abs(amount))}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleAutoCategorizeSingle(tx)}
                              disabled={autoCategorizingTxId === tx.id || deletingTransactionId !== null}
                              className="inline-flex p-1.5 rounded-md text-purple-500 hover:text-purple-700 hover:bg-purple-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              title="AI: סווג רק את התנועה הזו"
                            >
                              {autoCategorizingTxId === tx.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Wand2 className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              onClick={() => handleDeleteTransaction(tx)}
                              disabled={deletingTransactionId === tx.id || autoCategorizingTxId !== null}
                              className="inline-flex p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              title="מחק תנועה"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : viewMode === 'grouped' ? (
        <>
          <div className="md:hidden divide-y divide-gray-100">
            {groupedTransactions.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500">
                אין תנועות להצגה
              </div>
            ) : (
              groupedTransactions.map((group) => {
                const isExpense = group.totalAmount < 0;

                return (
                  <div key={group.description} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 break-words">
                          {group.description}
                        </p>
                        {group.count > 1 ? (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {group.count} עסקאות · {formatDate(group.dates[group.dates.length - 1])} - {formatDate(group.dates[0])}
                          </p>
                        ) : (
                          <p className="text-xs text-gray-500 mt-0.5">עסקה אחת</p>
                        )}
                      </div>
                      <span className={`text-sm font-semibold whitespace-nowrap ${isExpense ? 'text-red-600' : 'text-green-600'}`}>
                        {isExpense ? '' : '+'}{formatCurrency(Math.abs(group.totalAmount))}
                      </span>
                    </div>
                    <CategorySelector
                      transactionId={group.firstTransactionId}
                      transactionDescription={group.description}
                      currentCategory={group.category}
                      categories={categories as Category[]}
                      onCategoryChange={handleCategoryChange}
                    />
                  </div>
                );
              })
            )}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">תיאור</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">כמות</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">קטגוריה</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">סה״כ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {groupedTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      אין תנועות להצגה
                    </td>
                  </tr>
                ) : (
                  groupedTransactions.map((group) => {
                    const isExpense = group.totalAmount < 0;

                    return (
                      <tr key={group.description} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-900 truncate max-w-[300px]">
                            {group.description}
                          </p>
                          {group.count > 1 && (
                            <p className="text-xs text-gray-400 mt-1">
                              {formatDate(group.dates[group.dates.length - 1])} - {formatDate(group.dates[0])}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {group.count > 1 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                              <Layers className="h-3 w-3" />
                              {group.count} עסקאות
                            </span>
                          ) : (
                            <span className="text-sm text-gray-500">עסקה אחת</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <CategorySelector
                            transactionId={group.firstTransactionId}
                            transactionDescription={group.description}
                            currentCategory={group.category}
                            categories={categories as Category[]}
                            onCategoryChange={handleCategoryChange}
                          />
                        </td>
                        <td className="px-4 py-3 text-left">
                          <span className={`text-sm font-semibold ${isExpense ? 'text-red-600' : 'text-green-600'}`}>
                            {isExpense ? '' : '+'}{formatCurrency(Math.abs(group.totalAmount))}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        /* Category View */
        <div className="p-4 space-y-4">
          {sortedCategories.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              אין תנועות להצגה
            </div>
          ) : (
            sortedCategories.map(([categoryKey, data]) => {
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
                          {data.transactions.length} תנועות
                        </p>
                      </div>
                    </div>
                    <div className="text-left">
                      <p className={`text-xl font-bold ${isExpense ? 'text-red-600' : 'text-green-600'}`}>
                        {isExpense ? '' : '+'}{formatCurrency(Math.abs(data.total))}
                      </p>
                    </div>
                  </div>

                  {/* Transactions in this category */}
                  <div className="divide-y divide-gray-100">
                    {(expandedCategories.has(categoryKey)
                      ? data.transactions
                      : data.transactions.slice(0, 5)
                    ).map(tx => {
                      const amount = parseFloat(tx.amount);
                      const txIsExpense = amount < 0;

                      return (
                        <div key={tx.id} className="px-4 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 hover:bg-gray-50">
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            <span className="text-xs sm:text-sm text-gray-400">
                              {formatDate(tx.date)}
                            </span>
                            <span className="text-sm text-gray-700 break-words">
                              {tx.description}
                            </span>
                            {isUncategorized && (
                              <CategorySelector
                                transactionId={tx.id}
                                transactionDescription={tx.description}
                                currentCategory={null}
                                categories={categories as Category[]}
                                onCategoryChange={handleCategoryChange}
                              />
                            )}
                          </div>
                          <span className={`text-sm font-medium self-end sm:self-auto ${txIsExpense ? 'text-red-600' : 'text-green-600'}`}>
                            {txIsExpense ? '' : '+'}{formatCurrency(Math.abs(amount))}
                          </span>
                        </div>
                      );
                    })}
                    {data.transactions.length > 5 && (
                      <button
                        onClick={() => toggleCategoryExpanded(categoryKey)}
                        className="w-full px-4 py-2 text-center text-sm text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center gap-1"
                      >
                        {expandedCategories.has(categoryKey) ? (
                          <>
                            <ChevronUp className="h-4 w-4" />
                            הסתר
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-4 w-4" />
                            + עוד {data.transactions.length - 5} תנועות
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Summary */}
      {filteredTransactions.length > 0 && (
        <div className="p-4 border-t bg-gray-50 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <span className="text-sm text-gray-600">
            {filteredTransactions.length} תנועות
            {filteredTransactions.filter(tx => !tx.categoryId).length > 0 && (
              <span className="text-orange-600 mr-2">
                ({filteredTransactions.filter(tx => !tx.categoryId).length} לא מסווגות)
              </span>
            )}
          </span>
          <div className="flex flex-wrap gap-4 sm:gap-6">
            <span className="text-sm">
              <span className="text-gray-500">סה״כ הוצאות: </span>
              <span className="font-semibold text-red-600">
                {formatCurrency(
                  filteredTransactions
                    .filter(tx => parseFloat(tx.amount) < 0)
                    .reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount)), 0)
                )}
              </span>
            </span>
            <span className="text-sm">
              <span className="text-gray-500">סה״כ הכנסות: </span>
              <span className="font-semibold text-green-600">
                {formatCurrency(
                  filteredTransactions
                    .filter(tx => parseFloat(tx.amount) > 0)
                    .reduce((sum, tx) => sum + parseFloat(tx.amount), 0)
                )}
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
