'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { formatCurrency, formatDate, getHebrewMonthName } from '@/lib/formatters';
import { Search, LayoutList, PieChart, Wand2, Loader2, Layers, ChevronRight, ChevronLeft, CalendarDays, Repeat, MessageSquare, ChevronDown, ChevronUp, Trash2, X, Check, Plus, SlidersHorizontal } from 'lucide-react';
import { CategorySelector } from './CategorySelector';
import { showToast } from '@/components/ui/Toast';
import dayjs from 'dayjs';
import { stripTrailingFinalDot } from '@/lib/text-utils';
import { getPeriodKey, type PeriodMode } from '@/lib/period-utils';
import { extractMerchantSignature } from '@/lib/merchantSimilarity';
import type { SnoozedSuggestionMap } from '@/lib/recurring-suggestion-snooze';

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
    type?: 'EXPENSE' | 'INCOME' | 'TRANSFER';
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
  type?: 'EXPENSE' | 'INCOME' | 'TRANSFER';
}

interface ApiCategory {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  type?: 'EXPENSE' | 'INCOME' | 'TRANSFER';
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
  periodMode: PeriodMode;
  initialCategoryId?: string;
  initialSnoozedSuggestionExpirations?: SnoozedSuggestionMap;
}

type ViewMode = 'list' | 'byCategory' | 'grouped';
type AmountTypeFilter = 'all' | 'expense' | 'income';
type ManualTransactionType = 'expense' | 'income';

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

type RecurringSuggestionAction = 'add' | 'remove';
type RecurringSuggestionDirection = 'expense' | 'income';

interface RecurringSuggestion {
  key: string;
  action: RecurringSuggestionAction;
  direction: RecurringSuggestionDirection;
  description: string;
  transactionIds: string[];
  periodCount: number;
  consecutivePeriodCount: number;
  minAmount: number;
  maxAmount: number;
  medianAmount: number;
  lastDate: string;
  daysSinceLast: number;
}

interface RecurringSuggestionCluster {
  key: string;
  direction: RecurringSuggestionDirection;
  description: string;
  allTransactions: Transaction[];
  nonRecurringTransactions: Transaction[];
  recurringTransactions: Transaction[];
}

interface DescriptionEditTriggerProps {
  value: string;
  onEdit: () => void;
  className?: string;
}

const AMOUNT_MATCH_EPSILON = 0.01;
const RECURRING_SUGGESTION_AMOUNT_TOLERANCE = 10;
const RECURRING_SUGGESTION_MIN_PERIODS = 3;
const RECURRING_RECENT_WINDOW_DAYS = 45;
const RECURRING_REMOVE_BASE_THRESHOLD_DAYS = 60;
const MAX_RECURRING_SUGGESTIONS = 8;
const RECURRING_SNOOZE_DEFAULT_DAYS = 30;
const RECURRING_SNOOZE_LONG_DAYS = 90;
const LIST_INITIAL_RENDER_LIMIT = 120;
const LIST_RENDER_STEP = 120;

function DescriptionEditTrigger({
  value,
  onEdit,
  className = '',
}: DescriptionEditTriggerProps) {
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  useEffect(() => () => {
    clearLongPress();
  }, []);

  return (
    <button
      type="button"
      onContextMenu={(event) => {
        event.preventDefault();
        onEdit();
      }}
      onTouchStart={() => {
        clearLongPress();
        longPressTriggeredRef.current = false;
        longPressTimerRef.current = window.setTimeout(() => {
          longPressTriggeredRef.current = true;
          if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(10);
          }
          onEdit();
        }, 450);
      }}
      onTouchEnd={(event) => {
        clearLongPress();
        if (longPressTriggeredRef.current) {
          event.preventDefault();
          longPressTriggeredRef.current = false;
        }
      }}
      onTouchMove={clearLongPress}
      onTouchCancel={clearLongPress}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onEdit();
        }
      }}
      className={className}
      title="לחיצה ארוכה במובייל או קליק ימני בדסקטופ לעריכת שם העסקה"
      aria-label={`ערוך שם עסקה: ${value}`}
    >
      {value}
    </button>
  );
}

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

function parseAbsAmount(amountValue: string): number {
  const parsed = parseFloat(amountValue);
  if (!Number.isFinite(parsed)) return 0;
  return Math.abs(parsed);
}

function getMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function getRepresentativeDescription(transactions: Transaction[]): string {
  if (transactions.length === 0) return '';
  const latest = [...transactions]
    .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf())[0];
  return latest?.description || '';
}

function getPeriodIndex(periodKey: string): number | null {
  const [yearStr, monthStr] = periodKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  if (month < 1 || month > 12) return null;
  return year * 12 + (month - 1);
}

function getLongestConsecutivePeriodStreak(periodKeys: string[]): number {
  const indexes = periodKeys
    .map(getPeriodIndex)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  if (indexes.length === 0) return 0;

  let longest = 1;
  let current = 1;
  for (let i = 1; i < indexes.length; i += 1) {
    if (indexes[i] === indexes[i - 1] + 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else if (indexes[i] !== indexes[i - 1]) {
      current = 1;
    }
  }

  return longest;
}

function buildRecurringSuggestionClusters(transactions: Transaction[]): RecurringSuggestionCluster[] {
  const clusters = new Map<string, RecurringSuggestionCluster>();

  for (const tx of transactions) {
    const amount = parseFloat(tx.amount);
    if (!Number.isFinite(amount) || amount === 0) continue;
    if (tx.category?.type === 'TRANSFER') continue;

    const signature = extractMerchantSignature(tx.description);
    if (!signature) continue;

    const normalizedSignature = signature.trim().toLowerCase();
    if (normalizedSignature.length < 2) continue;

    const direction: RecurringSuggestionDirection = amount < 0 ? 'expense' : 'income';
    const clusterKey = `${direction}|${normalizedSignature}`;

    const existing = clusters.get(clusterKey);
    if (existing) {
      existing.allTransactions.push(tx);
      if (tx.isRecurring) {
        existing.recurringTransactions.push(tx);
      } else {
        existing.nonRecurringTransactions.push(tx);
      }
      continue;
    }

    clusters.set(clusterKey, {
      key: clusterKey,
      direction,
      description: tx.description,
      allTransactions: [tx],
      nonRecurringTransactions: tx.isRecurring ? [] : [tx],
      recurringTransactions: tx.isRecurring ? [tx] : [],
    });
  }

  return Array.from(clusters.values()).map((cluster) => ({
    ...cluster,
    description: getRepresentativeDescription(cluster.allTransactions),
  }));
}

function buildRecurringSuggestions(
  transactions: Transaction[],
  periodMode: PeriodMode
): RecurringSuggestion[] {
  const now = dayjs();
  const clusters = buildRecurringSuggestionClusters(transactions);
  const suggestions: RecurringSuggestion[] = [];

  for (const cluster of clusters) {
    if (cluster.nonRecurringTransactions.length >= RECURRING_SUGGESTION_MIN_PERIODS && cluster.recurringTransactions.length === 0) {
      const periodKeySet = new Set(
        cluster.nonRecurringTransactions.map((tx) => getPeriodKey(dayjs(tx.date), periodMode))
      );
      const periodKeys = Array.from(periodKeySet);
      const consecutivePeriodCount = getLongestConsecutivePeriodStreak(periodKeys);

      if (periodKeys.length >= RECURRING_SUGGESTION_MIN_PERIODS && consecutivePeriodCount >= RECURRING_SUGGESTION_MIN_PERIODS) {
        const amounts = cluster.nonRecurringTransactions.map((tx) => parseAbsAmount(tx.amount));
        const medianAmount = getMedian(amounts);
        const isWithinTolerance = amounts.every(
          (value) => Math.abs(value - medianAmount) <= RECURRING_SUGGESTION_AMOUNT_TOLERANCE
        );

        const latestTx = [...cluster.nonRecurringTransactions]
          .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf())[0];
        const daysSinceLast = latestTx ? Math.max(0, now.diff(dayjs(latestTx.date), 'day')) : 9999;

        if (isWithinTolerance && latestTx && daysSinceLast <= RECURRING_RECENT_WINDOW_DAYS) {
          suggestions.push({
            key: `add|${cluster.key}`,
            action: 'add',
            direction: cluster.direction,
            description: cluster.description,
            transactionIds: cluster.nonRecurringTransactions.map((tx) => tx.id),
            periodCount: periodKeys.length,
            consecutivePeriodCount,
            minAmount: Math.min(...amounts),
            maxAmount: Math.max(...amounts),
            medianAmount,
            lastDate: latestTx.date,
            daysSinceLast,
          });
        }
      }
    }

    if (cluster.recurringTransactions.length >= RECURRING_SUGGESTION_MIN_PERIODS) {
      const recurringSorted = [...cluster.recurringTransactions]
        .sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf());
      const latestRecurring = recurringSorted[recurringSorted.length - 1];
      const latestAny = [...cluster.allTransactions]
        .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf())[0];

      if (!latestRecurring || !latestAny) continue;

      const intervals: number[] = [];
      for (let i = 1; i < recurringSorted.length; i += 1) {
        const diff = Math.abs(dayjs(recurringSorted[i].date).diff(dayjs(recurringSorted[i - 1].date), 'day'));
        if (diff > 0) intervals.push(diff);
      }

      const typicalIntervalDays = intervals.length > 0 ? getMedian(intervals) : 30;
      const overdueThresholdDays = Math.max(
        RECURRING_REMOVE_BASE_THRESHOLD_DAYS,
        Math.ceil(typicalIntervalDays * 1.8)
      );
      const daysSinceRecurringLast = Math.max(0, now.diff(dayjs(latestRecurring.date), 'day'));
      const daysSinceAnyLast = Math.max(0, now.diff(dayjs(latestAny.date), 'day'));

      if (daysSinceRecurringLast >= overdueThresholdDays && daysSinceAnyLast > RECURRING_RECENT_WINDOW_DAYS) {
        const amounts = cluster.recurringTransactions.map((tx) => parseAbsAmount(tx.amount));
        const recurringPeriodKeys = Array.from(new Set(
          cluster.recurringTransactions.map((tx) => getPeriodKey(dayjs(tx.date), periodMode))
        ));
        const recurringPeriodCount = recurringPeriodKeys.length;
        const consecutivePeriodCount = getLongestConsecutivePeriodStreak(recurringPeriodKeys);

        suggestions.push({
          key: `remove|${cluster.key}`,
          action: 'remove',
          direction: cluster.direction,
          description: cluster.description,
          transactionIds: cluster.recurringTransactions.map((tx) => tx.id),
          periodCount: recurringPeriodCount,
          consecutivePeriodCount,
          minAmount: Math.min(...amounts),
          maxAmount: Math.max(...amounts),
          medianAmount: getMedian(amounts),
          lastDate: latestRecurring.date,
          daysSinceLast: daysSinceRecurringLast,
        });
      }
    }
  }

  return suggestions
    .sort((a, b) => dayjs(b.lastDate).valueOf() - dayjs(a.lastDate).valueOf())
    .slice(0, MAX_RECURRING_SUGGESTIONS);
}

export function TransactionList({
  transactions: initialTransactions,
  categories: initialCategories,
  accounts,
  periodMode,
  initialCategoryId = '',
  initialSnoozedSuggestionExpirations = {},
}: TransactionListProps) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [categories, setCategories] = useState(initialCategories);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategoryId);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [selectedAmountType, setSelectedAmountType] = useState<AmountTypeFilter>('all');
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>(''); // '' = all, 'YYYY-MM' = specific
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [isBulkCategoryMenuOpen, setIsBulkCategoryMenuOpen] = useState(false);
  const [bulkCategorySearchTerm, setBulkCategorySearchTerm] = useState('');
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [isAutoCategorizing, setIsAutoCategorizing] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isCreatingManualTransaction, setIsCreatingManualTransaction] = useState(false);
  const [manualType, setManualType] = useState<ManualTransactionType>('expense');
  const [manualAmount, setManualAmount] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualDate, setManualDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [manualCategoryId, setManualCategoryId] = useState('');
  const [manualAccountId, setManualAccountId] = useState('manual');
  const [manualNotes, setManualNotes] = useState('');
  const [manualIsRecurring, setManualIsRecurring] = useState(false);
  const [autoCategorizingTxId, setAutoCategorizingTxId] = useState<string | null>(null);
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null);
  const [activeSuggestionKey, setActiveSuggestionKey] = useState<string | null>(null);
  const [snoozingSuggestionKey, setSnoozingSuggestionKey] = useState<string | null>(null);
  const [snoozedSuggestionExpirations, setSnoozedSuggestionExpirations] = useState<SnoozedSuggestionMap>(initialSnoozedSuggestionExpirations);
  const [listRenderLimit, setListRenderLimit] = useState(LIST_INITIAL_RENDER_LIMIT);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);
  const bulkCategoryMenuRef = useRef<HTMLDivElement>(null);
  const bulkCategorySearchInputRef = useRef<HTMLInputElement>(null);

  // Notes inline editing
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState('');
  const [editingDescriptionTransaction, setEditingDescriptionTransaction] = useState<Transaction | null>(null);
  const [descriptionValue, setDescriptionValue] = useState('');
  const [applyDescriptionToSimilar, setApplyDescriptionToSimilar] = useState(false);
  const [isSavingDescription, setIsSavingDescription] = useState(false);

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
          type: cat.type,
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

  useEffect(() => {
    if (viewMode === 'grouped') {
      setSelectedTransactionIds(new Set());
      setBulkCategoryId('');
      setIsBulkCategoryMenuOpen(false);
      setBulkCategorySearchTerm('');
    }
  }, [viewMode]);

  useEffect(() => {
    setSelectedTransactionIds((prev) => {
      if (prev.size === 0) return prev;
      const existingIds = new Set(transactions.map((tx) => tx.id));
      const next = new Set<string>();
      for (const id of prev) {
        if (existingIds.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [transactions]);

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

  const renderedListTransactions = useMemo(
    () => filteredTransactions.slice(0, listRenderLimit),
    [filteredTransactions, listRenderLimit]
  );
  const hasMoreListTransactions = filteredTransactions.length > renderedListTransactions.length;
  const remainingListTransactionsCount = Math.max(0, filteredTransactions.length - renderedListTransactions.length);

  const visibleIds = useMemo(
    () => (viewMode === 'list' ? renderedListTransactions : filteredTransactions).map((tx) => tx.id),
    [viewMode, renderedListTransactions, filteredTransactions]
  );
  const sortedBulkCategories = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name, 'he')),
    [categories]
  );
  const filteredBulkCategories = useMemo(() => {
    const normalized = bulkCategorySearchTerm.trim().toLowerCase();
    if (!normalized) return sortedBulkCategories;
    return sortedBulkCategories.filter((cat) => (
      cat.name.toLowerCase().includes(normalized)
      || (cat.icon || '').toLowerCase().includes(normalized)
    ));
  }, [sortedBulkCategories, bulkCategorySearchTerm]);
  const selectedBulkCategoryLabel = useMemo(() => {
    if (!bulkCategoryId) return 'בחר קטגוריה לשיוך';
    if (bulkCategoryId === 'uncategorized') return 'ללא קטגוריה';
    const selectedCategoryOption = categories.find((cat) => cat.id === bulkCategoryId);
    if (!selectedCategoryOption) return 'בחר קטגוריה לשיוך';
    return `${selectedCategoryOption.icon || '📁'} ${selectedCategoryOption.name}`;
  }, [bulkCategoryId, categories]);
  const activeMobileFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedAccount) count++;
    if (selectedCategory) count++;
    if (selectedAmountType !== 'all') count++;
    return count;
  }, [selectedAccount, selectedCategory, selectedAmountType]);
  const manualCategoryOptions = useMemo(() => {
    const filtered = categories.filter((category) => {
      if (!category.type) return true;
      if (manualType === 'expense') return category.type !== 'INCOME';
      return category.type !== 'EXPENSE';
    });
    return filtered.sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [categories, manualType]);
  const manualAccountOptions = useMemo(
    () => [...accounts].sort((a, b) => a.name.localeCompare(b.name, 'he')),
    [accounts]
  );
  const selectedVisibleCount = visibleIds.filter((id) => selectedTransactionIds.has(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const selectedCount = selectedTransactionIds.size;
  const recurringSuggestions = useMemo(
    () => buildRecurringSuggestions(transactions, periodMode)
      .filter((suggestion) => !snoozedSuggestionExpirations[suggestion.key]),
    [transactions, periodMode, snoozedSuggestionExpirations]
  );

  useEffect(() => {
    setListRenderLimit(LIST_INITIAL_RENDER_LIMIT);
  }, [viewMode, searchTerm, selectedCategory, selectedAccount, selectedAmountType, selectedMonth]);

  useEffect(() => {
    if (!selectAllCheckboxRef.current) return;
    selectAllCheckboxRef.current.indeterminate = selectedVisibleCount > 0 && !allVisibleSelected;
  }, [selectedVisibleCount, allVisibleSelected]);

  useEffect(() => {
    if (!isBulkCategoryMenuOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (!bulkCategoryMenuRef.current) return;
      const target = event.target as Node;
      if (!bulkCategoryMenuRef.current.contains(target)) {
        setIsBulkCategoryMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsBulkCategoryMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isBulkCategoryMenuOpen]);

  useEffect(() => {
    if (!isBulkCategoryMenuOpen) return;
    requestAnimationFrame(() => {
      bulkCategorySearchInputRef.current?.focus();
    });
  }, [isBulkCategoryMenuOpen]);

  useEffect(() => {
    if (selectedCount > 0) return;
    setIsBulkCategoryMenuOpen(false);
    setBulkCategorySearchTerm('');
  }, [selectedCount]);

  useEffect(() => {
    if (!manualCategoryId) return;
    const stillAvailable = manualCategoryOptions.some((category) => category.id === manualCategoryId);
    if (!stillAvailable) {
      setManualCategoryId('');
    }
  }, [manualCategoryId, manualCategoryOptions]);

  useEffect(() => {
    if (manualType === 'income' && manualIsRecurring) {
      setManualIsRecurring(false);
    }
  }, [manualType, manualIsRecurring]);

  useEffect(() => {
    if (!isMobileFiltersOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileFiltersOpen]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 640px)');
    const handleMediaChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setIsMobileFiltersOpen(false);
      }
    };

    if (mediaQuery.matches) {
      setIsMobileFiltersOpen(false);
    }

    mediaQuery.addEventListener('change', handleMediaChange);
    return () => {
      mediaQuery.removeEventListener('change', handleMediaChange);
    };
  }, []);

  // Group transactions by description for grouped view.
  const groupedTransactions = useMemo(() => {
    if (viewMode !== 'grouped') return [];

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

      // Use most recent category if available.
      if (tx.category && !groups[key].category) {
        groups[key].category = tx.category;
        groups[key].categoryId = tx.categoryId;
      }
    }

    // Sort by total amount (expenses first, largest first).
    return Object.values(groups).sort((a, b) => a.totalAmount - b.totalAmount);
  }, [filteredTransactions, viewMode]);

  // Group transactions by category for the category view.
  const sortedCategories = useMemo(() => {
    if (viewMode !== 'byCategory') {
      return [] as Array<[string, { category: Transaction['category']; transactions: Transaction[]; total: number }]>;
    }

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

    // Sort categories by total (expenses first, largest first).
    return Object.entries(groupedByCategory)
      .sort(([, a], [, b]) => a.total - b.total);
  }, [filteredTransactions, viewMode]);

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

  const toggleTransactionSelection = (transactionId: string) => {
    setSelectedTransactionIds((prev) => {
      const next = new Set(prev);
      if (next.has(transactionId)) {
        next.delete(transactionId);
      } else {
        next.add(transactionId);
      }
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedTransactionIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedTransactionIds(new Set());
    setBulkCategoryId('');
    setIsBulkCategoryMenuOpen(false);
    setBulkCategorySearchTerm('');
  };

  const resetManualForm = () => {
    setManualType('expense');
    setManualAmount('');
    setManualDescription('');
    setManualDate(dayjs().format('YYYY-MM-DD'));
    setManualCategoryId('');
    setManualAccountId('manual');
    setManualNotes('');
    setManualIsRecurring(false);
  };

  const openManualModal = () => {
    resetManualForm();
    setIsManualModalOpen(true);
  };

  const closeManualModal = () => {
    if (isCreatingManualTransaction) return;
    setIsManualModalOpen(false);
  };

  const handleBulkCategoryPick = (categoryId: string) => {
    setBulkCategoryId(categoryId);
    setIsBulkCategoryMenuOpen(false);
    setBulkCategorySearchTerm('');
  };

  const handleCreateManualTransaction = async () => {
    if (isCreatingManualTransaction) return;

    const description = manualDescription.trim();
    const normalizedAmount = manualAmount.replace(/[,\s₪]/g, '');
    const parsedAmount = Number(normalizedAmount);

    if (!description) {
      showToast('יש להזין תיאור לתנועה', 'info');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      showToast('יש להזין סכום חיובי תקין', 'info');
      return;
    }
    if (!manualDate) {
      showToast('יש לבחור תאריך', 'info');
      return;
    }

    setIsCreatingManualTransaction(true);
    try {
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          amount: parsedAmount,
          type: manualType,
          date: manualDate,
          categoryId: manualCategoryId || null,
          accountId: manualAccountId === 'manual' ? null : manualAccountId,
          notes: manualNotes.trim() || null,
          isRecurring: manualIsRecurring,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          showToast('כבר קיימת תנועה זהה באותו תאריך', 'info');
          return;
        }
        showToast(result?.error || 'שגיאה בהוספת תנועה ידנית', 'error');
        return;
      }

      const createdTx = result.transaction as {
        id: string;
        date: string;
        description: string;
        amount: string | number;
        categoryId: string | null;
        category: {
          id: string;
          name: string;
          icon?: string | null;
          color?: string | null;
          type?: 'EXPENSE' | 'INCOME' | 'TRANSFER';
        } | null;
        account: {
          id: string;
          name: string;
          institution: string;
        };
        isAutoCategorized: boolean;
        isRecurring: boolean;
        notes: string | null;
      };

      const mappedTransaction: Transaction = {
        id: createdTx.id,
        date: createdTx.date,
        description: createdTx.description,
        amount: String(createdTx.amount),
        categoryId: createdTx.categoryId,
        category: createdTx.category ? {
          id: createdTx.category.id,
          name: createdTx.category.name,
          icon: createdTx.category.icon || '',
          color: createdTx.category.color || '#888',
          type: createdTx.category.type,
        } : null,
        account: {
          id: createdTx.account.id,
          name: createdTx.account.name,
          institution: createdTx.account.institution,
        },
        isAutoCategorized: Boolean(createdTx.isAutoCategorized),
        isRecurring: Boolean(createdTx.isRecurring),
        notes: createdTx.notes ?? null,
      };

      setTransactions((prev) => [mappedTransaction, ...prev]);
      setIsManualModalOpen(false);
      showToast('התנועה נוספה בהצלחה', 'success');
    } catch (error) {
      console.error('Create manual transaction error:', error);
      showToast('שגיאה בהוספת תנועה ידנית', 'error');
    } finally {
      setIsCreatingManualTransaction(false);
    }
  };

  const handleBulkCategoryAssign = async () => {
    if (selectedCount === 0) return;
    if (!bulkCategoryId) {
      showToast('בחר קטגוריה לשיוך', 'info');
      return;
    }

    const normalizedCategoryId = bulkCategoryId === 'uncategorized' ? null : bulkCategoryId;
    const selectedIds = Array.from(selectedTransactionIds);

    setIsBulkUpdating(true);
    try {
      const response = await fetch('/api/transactions/bulk-category', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionIds: selectedIds,
          categoryId: normalizedCategoryId,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || 'Bulk update failed');

      const newCategory = normalizedCategoryId
        ? categories.find((category) => category.id === normalizedCategoryId) || null
        : null;
      const mappedCategory = newCategory ? {
        id: newCategory.id,
        name: newCategory.name,
        icon: newCategory.icon || '📁',
        color: newCategory.color || '#6B7280',
        type: newCategory.type,
      } : null;
      const selectedSet = new Set(selectedIds);

      setTransactions((prev) => prev.map((tx) => {
        if (!selectedSet.has(tx.id)) return tx;
        return {
          ...tx,
          categoryId: normalizedCategoryId,
          category: mappedCategory,
          isAutoCategorized: false,
        };
      }));

      const updatedCount = Number(result?.updatedCount || selectedIds.length);
      showToast(`עודכנו ${updatedCount} תנועות`, 'success');
      clearSelection();
    } catch (error) {
      console.error('Bulk category update error:', error);
      showToast('שגיאה בעדכון מרוכז של קטגוריה', 'error');
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const dismissRecurringSuggestion = async (suggestionKey: string, snoozeDays: number = RECURRING_SNOOZE_DEFAULT_DAYS) => {
    if (snoozingSuggestionKey || activeSuggestionKey) return;

    const previousValue = snoozedSuggestionExpirations[suggestionKey];
    const expiresAt = dayjs().add(snoozeDays, 'day').endOf('day').toISOString();

    setSnoozedSuggestionExpirations((prev) => ({
      ...prev,
      [suggestionKey]: expiresAt,
    }));
    setSnoozingSuggestionKey(suggestionKey);

    try {
      const response = await fetch('/api/transactions/recurring-suggestions-snooze', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestionKey,
          snoozeDays,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save snooze');
      }

      showToast(`ההצעה הושהתה ל-${snoozeDays} יום`, 'info');
    } catch (error) {
      console.error('Snooze recurring suggestion error:', error);
      setSnoozedSuggestionExpirations((prev) => {
        const next = { ...prev };
        if (previousValue) {
          next[suggestionKey] = previousValue;
        } else {
          delete next[suggestionKey];
        }
        return next;
      });
      showToast('שגיאה בשמירת השהיית ההצעה', 'error');
    } finally {
      setSnoozingSuggestionKey(null);
    }
  };

  const handleRecurringSuggestionAction = async (suggestion: RecurringSuggestion) => {
    if (activeSuggestionKey) return;

    const transactionIds = Array.from(new Set(suggestion.transactionIds)).filter(Boolean);
    if (transactionIds.length === 0) {
      dismissRecurringSuggestion(suggestion.key);
      return;
    }

    const shouldSetRecurring = suggestion.action === 'add';
    setActiveSuggestionKey(suggestion.key);

    try {
      const response = await fetch('/api/transactions/bulk-recurring', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionIds,
          isRecurring: shouldSetRecurring,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Bulk recurring update failed');
      }

      const idsSet = new Set(transactionIds);
      setTransactions((prev) => prev.map((tx) => (
        idsSet.has(tx.id)
          ? { ...tx, isRecurring: shouldSetRecurring }
          : tx
      )));

      const updatedCount = Number(payload?.updatedCount || transactionIds.length);
      if (shouldSetRecurring) {
        showToast(
          `סומן כקבוע: ${updatedCount} תנועות ${suggestion.direction === 'expense' ? 'הוצאה' : 'הכנסה'}`,
          'learning'
        );
      } else {
        showToast(
          `הוסר מקבועות: ${updatedCount} תנועות ${suggestion.direction === 'expense' ? 'הוצאה' : 'הכנסה'}`,
          'success'
        );
      }

    } catch (error) {
      console.error('Recurring suggestion action error:', error);
      showToast('שגיאה בעדכון תנועות קבועות', 'error');
    } finally {
      setActiveSuggestionKey(null);
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
        type: newCategory.type,
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
      } else if (result.propagationSkippedDueToSafety) {
        const matched = Number(result.matchedSimilarCount || 0);
        showToast(
          `עודכנה רק התנועה שבחרת. נחסמה הפצה אוטומטית כי נמצאו ${matched} תנועות דומות (יותר מדי).`,
          'info'
        );
      } else if (result.propagationSkipped) {
        showToast('עודכנה רק התנועה שבחרת. לא בוצעה הפצה לדומות כי הזיהוי לא מספיק מדויק.', 'info');
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

  const handleGroupedCategoryChange = async (
    groupTransactions: Transaction[],
    categoryId: string,
    learnFromThis: boolean,
    applyToSimilar: boolean
  ) => {
    const transactionIds = Array.from(new Set(groupTransactions.map((tx) => tx.id)));
    if (transactionIds.length === 0) return;

    const normalizedCategoryId = categoryId === 'uncategorized' ? null : categoryId;

    try {
      const bulkResponse = await fetch('/api/transactions/bulk-category', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionIds,
          categoryId: normalizedCategoryId,
        }),
      });

      const bulkResult = await bulkResponse.json();
      if (!bulkResponse.ok) throw new Error(bulkResult?.error || 'Bulk grouped update failed');

      let updatedSimilarIds: string[] = [];
      let updatedSimilar = 0;
      let keywordAdded: string | null = null;
      let propagationSkipped = false;
      let propagationSkippedDueToSafety = false;
      let matchedSimilarCount = 0;

      if (learnFromThis || applyToSimilar) {
        const representativeId = transactionIds[0];
        const learnResponse = await fetch(`/api/transactions/${representativeId}/category`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoryId: normalizedCategoryId,
            learnFromThis,
            applyToSimilar,
          }),
        });

        const learnResult = await learnResponse.json();
        if (!learnResponse.ok) throw new Error(learnResult?.error || 'Grouped learning update failed');

        updatedSimilarIds = Array.isArray(learnResult.updatedSimilarIds) ? learnResult.updatedSimilarIds : [];
        updatedSimilar = Number(learnResult.updatedSimilar || 0);
        keywordAdded = typeof learnResult.keywordAdded === 'string' ? learnResult.keywordAdded : null;
        propagationSkipped = Boolean(learnResult.propagationSkipped);
        propagationSkippedDueToSafety = Boolean(learnResult.propagationSkippedDueToSafety);
        matchedSimilarCount = Number(learnResult.matchedSimilarCount || 0);
      }

      const categoryMatch = normalizedCategoryId
        ? categories.find((cat) => cat.id === normalizedCategoryId) || null
        : null;
      const mappedCategory = categoryMatch ? {
        id: categoryMatch.id,
        name: categoryMatch.name,
        icon: categoryMatch.icon || '📁',
        color: categoryMatch.color || '#6B7280',
        type: categoryMatch.type,
      } : null;

      const updatedIds = new Set<string>([...transactionIds, ...updatedSimilarIds]);
      setTransactions((prev) => prev.map((tx) => {
        if (!updatedIds.has(tx.id)) return tx;
        return {
          ...tx,
          categoryId: normalizedCategoryId,
          category: mappedCategory,
          isAutoCategorized: false,
        };
      }));

      const updatedGroupCount = Number(bulkResult?.updatedCount || transactionIds.length);

      if (applyToSimilar && propagationSkippedDueToSafety) {
        showToast(
          `עודכנו ${updatedGroupCount} תנועות בקבוצה. הפצה לדומות נחסמה כי נמצאו ${matchedSimilarCount} דומות`,
          'info'
        );
      } else if (applyToSimilar && propagationSkipped) {
        showToast(`עודכנו ${updatedGroupCount} תנועות בקבוצה. לא בוצעה הפצה לדומות`, 'info');
      } else if (applyToSimilar && updatedSimilar > 0) {
        showToast(`עודכנו ${updatedGroupCount} תנועות בקבוצה ועוד ${updatedSimilar} תנועות דומות`, 'learning');
      } else if (learnFromThis && keywordAdded) {
        showToast(`עודכנו ${updatedGroupCount} תנועות בקבוצה. למדתי "${keywordAdded}" להמשך`, 'learning');
      } else {
        showToast(`עודכנו ${updatedGroupCount} תנועות בקבוצה`, 'success');
      }
    } catch (error) {
      console.error('Grouped category update error:', error);
      showToast('שגיאה בעדכון קטגוריה במצב מאוחד', 'error');
    }
  };

  // --- Notes handlers ---
  const startEditingNote = (id: string, currentNote: string | null) => {
    setEditingNoteId(id);
    setNoteValue(currentNote || '');
  };

  const openDescriptionEditor = (transaction: Transaction) => {
    if (isSavingDescription) return;
    setEditingDescriptionTransaction(transaction);
    setDescriptionValue(transaction.description);
    setApplyDescriptionToSimilar(false);
  };

  const closeDescriptionEditor = () => {
    if (isSavingDescription) return;
    setEditingDescriptionTransaction(null);
    setDescriptionValue('');
    setApplyDescriptionToSimilar(false);
  };

  const handleDescriptionSave = async () => {
    if (!editingDescriptionTransaction || isSavingDescription) return;

    const description = stripTrailingFinalDot(descriptionValue).trim();
    if (!description) {
      showToast('יש להזין שם עסקה תקין', 'info');
      return;
    }

    if (description === editingDescriptionTransaction.description.trim()) {
      closeDescriptionEditor();
      return;
    }

    setIsSavingDescription(true);
    try {
      const response = await fetch(`/api/transactions/${editingDescriptionTransaction.id}/description`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          applyToSimilar: applyDescriptionToSimilar,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        showToast(result?.error || 'שגיאה בעדכון שם העסקה', 'error');
        return;
      }

      const deletedTransactionId = typeof result.deletedTransactionId === 'string'
        ? result.deletedTransactionId
        : null;
      const mergedTransactionId = typeof result?.transaction?.id === 'string'
        ? result.transaction.id
        : null;
      const canonicalCategoryId = typeof result?.transaction?.categoryId === 'string'
        ? result.transaction.categoryId
        : null;
      const canonicalCategory = result?.transaction?.category ?? null;
      const shouldApplyCanonicalCategory = Boolean(result.attachedToExistingCategory && canonicalCategoryId && canonicalCategory);
      const updatedIds = new Set<string>([
        editingDescriptionTransaction.id,
        ...(Array.isArray(result.updatedSimilarIds) ? result.updatedSimilarIds : []),
      ]);

      setTransactions((prev) => prev
        .filter((tx) => tx.id !== deletedTransactionId)
        .map((tx) => {
          if (mergedTransactionId && tx.id === mergedTransactionId) {
            return {
              ...tx,
              description,
              categoryId: result?.transaction?.categoryId ?? tx.categoryId,
              category: result?.transaction?.category ?? tx.category,
              notes: result?.transaction?.notes ?? tx.notes,
              isRecurring: typeof result?.transaction?.isRecurring === 'boolean'
                ? result.transaction.isRecurring
                : tx.isRecurring,
              isAutoCategorized: typeof result?.transaction?.isAutoCategorized === 'boolean'
                ? result.transaction.isAutoCategorized
                : tx.isAutoCategorized,
            };
          }

          if (updatedIds.has(tx.id)) {
            return {
              ...tx,
              description,
              ...(shouldApplyCanonicalCategory ? {
                categoryId: canonicalCategoryId,
                category: canonicalCategory,
                isAutoCategorized: false,
              } : {}),
            };
          }

          return tx;
        }));

      closeDescriptionEditor();

      if (result.mergedIntoExisting) {
        const attachedCategoryMessage = result.attachedToExistingCategory
          ? 'העסקה חוברה לרשומה קיימת וקיבלה גם את הקטגוריה שכבר הייתה עליה'
          : 'העסקה חוברה לרשומה קיימת עם השם החדש כדי למנוע כפילות';
        const similarMessage = Number(result.updatedSimilar || 0) > 0
          ? `. עודכנו גם ${Number(result.updatedSimilar || 0)} תנועות דומות`
          : '';
        showToast(`${attachedCategoryMessage}${similarMessage}`, 'success');
      } else if (result.propagationSkippedDueToSafety) {
        showToast(
          `שם העסקה עודכן. הפצה לדומות נחסמה כי נמצאו ${Number(result.matchedSimilarCount || 0)} תנועות דומות`,
          'info'
        );
      } else if (result.propagationSkipped) {
        showToast('שם העסקה עודכן רק עבור התנועה שבחרת', 'success');
      } else if (applyDescriptionToSimilar && Number(result.updatedSimilar || 0) > 0) {
        const conflictSuffix = Number(result.skippedConflictCount || 0) > 0
          ? `, ו-${Number(result.skippedConflictCount || 0)} דולגו בגלל כפילות`
          : '';
        showToast(
          `שם העסקה עודכן. עודכנו גם ${Number(result.updatedSimilar || 0)} תנועות דומות${conflictSuffix}`,
          'success'
        );
      } else if (Number(result.failedSimilarCount || 0) > 0) {
        showToast(
          `שם העסקה עודכן, אבל ${Number(result.failedSimilarCount || 0)} תנועות דומות לא עודכנו`,
          'info'
        );
      } else if (Number(result.skippedConflictCount || 0) > 0) {
        showToast(`שם העסקה עודכן. ${Number(result.skippedConflictCount || 0)} דולגו בגלל כפילות`, 'info');
      } else {
        showToast('שם העסקה עודכן', 'success');
      }
    } catch (error) {
      console.error('Description update error:', error);
      showToast('שגיאה בעדכון שם העסקה', 'error');
    } finally {
      setIsSavingDescription(false);
    }
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

        if (result.propagationSkippedDueToSafety) {
          const matched = Number(result.matchedSimilarCount || 0);
          showToast(`סווג אוטומטית ל"${category.name}". הפצה לדומות נחסמה (${matched} תנועות)`, 'info');
        } else if (updatedSimilar > 0) {
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

  const clearQuickFilters = () => {
    setSelectedAccount('');
    setSelectedCategory('');
    setSelectedAmountType('all');
  };

  const loadMoreListTransactions = () => {
    setListRenderLimit((prev) => prev + LIST_RENDER_STEP);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm">
      {/* Filters */}
      <div className="p-4 border-b flex flex-wrap items-stretch gap-3">
        <div className="hidden sm:block w-full lg:flex-1 lg:min-w-[260px] relative">
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
            onChange={(e) => setSearchTerm(stripTrailingFinalDot(e.target.value))}
            className="w-full pr-10 pl-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div className="w-full sm:hidden flex items-stretch gap-2">
          <button
            type="button"
            onClick={() => setIsMobileFiltersOpen(true)}
            className="relative h-11 w-11 shrink-0 border border-gray-300 rounded-lg bg-white text-gray-700 flex items-center justify-center"
            aria-expanded={isMobileFiltersOpen}
            aria-label="פתח פילטרים"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {activeMobileFiltersCount > 0 && (
              <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] px-1">
                {activeMobileFiltersCount}
              </span>
            )}
          </button>

          <div className="flex-1 relative">
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
              onChange={(e) => setSearchTerm(stripTrailingFinalDot(e.target.value))}
              className="w-full h-11 pr-10 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="hidden sm:flex w-full sm:flex-row sm:flex-wrap gap-3">
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

        <button
          onClick={openManualModal}
          className="w-full sm:w-auto px-4 py-2 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
        >
          <Plus className="h-4 w-4" />
          הוסף ידנית
        </button>

      </div>

      {isMobileFiltersOpen && (
        <div className="sm:hidden fixed inset-0 z-50">
          <button
            type="button"
            aria-label="סגור פילטרים"
            onClick={() => setIsMobileFiltersOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white border-t border-gray-200 shadow-xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">פילטרים מהירים</h3>
              <button
                type="button"
                onClick={() => setIsMobileFiltersOpen(false)}
                className="p-1 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                aria-label="סגור"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2">
              <select
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">כל החשבונות</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">כל הקטגוריות</option>
                <option value="uncategorized">ללא קטגוריה</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.icon} {cat.name}
                  </option>
                ))}
              </select>

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

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={clearQuickFilters}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium"
              >
                נקה פילטרים
              </button>
              <button
                type="button"
                onClick={() => setIsMobileFiltersOpen(false)}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium"
              >
                הצג תוצאות
              </button>
            </div>
          </div>
        </div>
      )}

      {recurringSuggestions.length > 0 && (
        <div className="px-4 py-3 border-b bg-indigo-50/40">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h3 className="text-sm font-semibold text-indigo-900">זיהוי חכם לתנועות קבועות</h3>
            <span className="text-xs text-indigo-700">{recurringSuggestions.length} הצעות</span>
          </div>
          <div className="space-y-2">
            {recurringSuggestions.map((suggestion) => {
              const isLoading = activeSuggestionKey === suggestion.key;
              const isSnoozing = snoozingSuggestionKey === suggestion.key;
              const directionLabel = suggestion.direction === 'expense' ? 'הוצאה' : 'הכנסה';
              const amountRangeText = Math.round(suggestion.minAmount) === Math.round(suggestion.maxAmount)
                ? formatCurrency(suggestion.medianAmount)
                : `${formatCurrency(suggestion.minAmount)} - ${formatCurrency(suggestion.maxAmount)}`;

              return (
                <div key={suggestion.key} className="rounded-lg border border-indigo-100 bg-white px-3 py-2">
                  {suggestion.action === 'add' ? (
                    <p className="text-sm text-gray-800 break-words">
                      זוהתה {directionLabel} חוזרת <span className="font-semibold">&quot;{suggestion.description}&quot;</span> במשך {suggestion.consecutivePeriodCount} תקופות רצופות
                      {' '}({suggestion.periodCount} בסך הכל), בטווח {amountRangeText}
                      <span className="text-gray-500 text-xs mr-1">±₪{RECURRING_SUGGESTION_AMOUNT_TOLERANCE}</span>
                      {' '}להוסיף לקבועות?
                    </p>
                  ) : (
                    <p className="text-sm text-gray-800 break-words">
                      לא זוהתה {directionLabel} קבועה <span className="font-semibold">&quot;{suggestion.description}&quot;</span> כבר {suggestion.daysSinceLast} ימים
                      {' '}(אחרון: {formatDate(suggestion.lastDate)})
                      {' '}להסיר מקבועות?
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRecurringSuggestionAction(suggestion)}
                      disabled={!!activeSuggestionKey || !!snoozingSuggestionKey}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      {suggestion.action === 'add' ? 'כן, הוסף לקבועות' : 'כן, הסר מקבועות'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void dismissRecurringSuggestion(suggestion.key, RECURRING_SNOOZE_DEFAULT_DAYS)}
                      disabled={isLoading || !!snoozingSuggestionKey}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-gray-200 text-gray-700 text-xs font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSnoozing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                      השהה 30 יום
                    </button>
                    <button
                      type="button"
                      onClick={() => void dismissRecurringSuggestion(suggestion.key, RECURRING_SNOOZE_LONG_DAYS)}
                      disabled={isLoading || !!snoozingSuggestionKey}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-gray-200 text-gray-700 text-xs font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <CalendarDays className="h-3.5 w-3.5" />
                      השהה 90 יום
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedCount > 0 && (
        <div className="sticky top-20 lg:top-3 z-30 px-3 sm:px-4 pt-3 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
          <div className="w-full p-3 rounded-lg border border-blue-200 bg-blue-50 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="text-sm text-blue-800">
              נבחרו {selectedCount} תנועות
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full lg:w-auto">
              <div ref={bulkCategoryMenuRef} className="relative w-full sm:w-[260px]">
                <button
                  type="button"
                  onClick={() => setIsBulkCategoryMenuOpen((prev) => !prev)}
                  className="w-full px-3 py-2 border border-blue-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right flex items-center justify-between"
                >
                  <span className="truncate">{selectedBulkCategoryLabel}</span>
                  <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${isBulkCategoryMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {isBulkCategoryMenuOpen && (
                  <div className="absolute top-full mt-1 right-0 z-40 w-full rounded-lg border border-blue-200 bg-white shadow-lg overflow-hidden">
                    <div className="p-2 border-b border-blue-100">
                      <div className="relative">
                        <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          ref={bulkCategorySearchInputRef}
                          type="text"
                          placeholder="חיפוש קטגוריה..."
                          value={bulkCategorySearchTerm}
                          onChange={(e) => setBulkCategorySearchTerm(stripTrailingFinalDot(e.target.value))}
                          className="w-full pr-8 pl-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div className="max-h-56 overflow-y-auto py-1">
                      <button
                        type="button"
                        onClick={() => handleBulkCategoryPick('uncategorized')}
                        className={`w-full px-3 py-2 text-right text-sm hover:bg-gray-50 flex items-center justify-between ${
                          bulkCategoryId === 'uncategorized' ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                        }`}
                      >
                        <span>ללא קטגוריה</span>
                        {bulkCategoryId === 'uncategorized' && <Check className="h-4 w-4" />}
                      </button>

                      {filteredBulkCategories.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-500">לא נמצאו קטגוריות</div>
                      ) : (
                        filteredBulkCategories.map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => handleBulkCategoryPick(cat.id)}
                            className={`w-full px-3 py-2 text-right text-sm hover:bg-gray-50 flex items-center justify-between ${
                              bulkCategoryId === cat.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                            }`}
                          >
                            <span className="truncate">{cat.icon || '📁'} {cat.name}</span>
                            {bulkCategoryId === cat.id && <Check className="h-4 w-4 flex-shrink-0" />}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={handleBulkCategoryAssign}
                disabled={isBulkUpdating || !bulkCategoryId}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isBulkUpdating ? 'מעדכן...' : 'שייך לנבחרות'}
              </button>
              <button
                onClick={clearSelection}
                disabled={isBulkUpdating}
                className="px-4 py-2 rounded-lg border border-blue-200 text-blue-700 text-sm font-medium hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                נקה בחירה
              </button>
            </div>
          </div>
        </div>
      )}

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
              renderedListTransactions.map((tx) => {
                const amount = parseFloat(tx.amount);
                const isExpense = amount < 0;

                return (
                  <div key={tx.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedTransactionIds.has(tx.id)}
                          onChange={() => toggleTransactionSelection(tx.id)}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          aria-label={`בחר תנועה ${tx.description}`}
                        />
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
                          <DescriptionEditTrigger
                            value={tx.description}
                            onEdit={() => openDescriptionEditor(tx)}
                            className="text-sm font-medium text-gray-900 break-words text-right hover:text-blue-700 transition-colors"
                          />
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

          {hasMoreListTransactions && (
            <div className="md:hidden px-4 py-3 border-t border-gray-100">
              <button
                type="button"
                onClick={loadMoreListTransactions}
                className="w-full px-4 py-2 rounded-lg border border-blue-200 text-blue-700 text-sm font-medium hover:bg-blue-50 transition-colors"
              >
                הצג עוד {Math.min(LIST_RENDER_STEP, remainingListTransactionsCount)} תנועות
              </button>
            </div>
          )}

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-center">
                    <input
                      ref={selectAllCheckboxRef}
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      aria-label="בחר הכל"
                    />
                  </th>
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
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      {transactions.length === 0
                        ? 'אין תנועות להצגה. העלה קבצי תנועות כדי להתחיל.'
                        : 'לא נמצאו תנועות התואמות לחיפוש'}
                    </td>
                  </tr>
                ) : (
                  renderedListTransactions.map((tx) => {
                    const amount = parseFloat(tx.amount);
                    const isExpense = amount < 0;

                    return (
                      <tr key={tx.id} className="group hover:bg-gray-50">
                        <td className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedTransactionIds.has(tx.id)}
                            onChange={() => toggleTransactionSelection(tx.id)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            aria-label={`בחר תנועה ${tx.description}`}
                          />
                        </td>
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
                              <DescriptionEditTrigger
                                value={tx.description}
                                onEdit={() => openDescriptionEditor(tx)}
                                className="text-sm font-medium text-gray-900 truncate max-w-[280px] hover:text-blue-700 transition-colors text-right"
                              />
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

            {hasMoreListTransactions && (
              <div className="px-4 py-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={loadMoreListTransactions}
                  className="px-4 py-2 rounded-lg border border-blue-200 text-blue-700 text-sm font-medium hover:bg-blue-50 transition-colors"
                >
                  הצג עוד {Math.min(LIST_RENDER_STEP, remainingListTransactionsCount)} תנועות
                </button>
              </div>
            )}
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
                const representativeTransaction = group.transactions[0];

                return (
                  <div key={group.description} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <DescriptionEditTrigger
                          value={group.description}
                          onEdit={() => representativeTransaction && openDescriptionEditor(representativeTransaction)}
                          className="text-sm font-medium text-gray-900 break-words text-right hover:text-blue-700 transition-colors"
                        />
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
                      onCategoryChange={async (_txId, categoryId, learnFromThis, applyToSimilar) => {
                        await handleGroupedCategoryChange(
                          group.transactions,
                          categoryId,
                          learnFromThis,
                          applyToSimilar
                        );
                      }}
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
                    const representativeTransaction = group.transactions[0];

                    return (
                      <tr key={group.description} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <DescriptionEditTrigger
                            value={group.description}
                            onEdit={() => representativeTransaction && openDescriptionEditor(representativeTransaction)}
                            className="text-sm font-medium text-gray-900 truncate max-w-[300px] hover:text-blue-700 transition-colors text-right"
                          />
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
                            onCategoryChange={async (_txId, categoryId, learnFromThis, applyToSimilar) => {
                              await handleGroupedCategoryChange(
                                group.transactions,
                                categoryId,
                                learnFromThis,
                                applyToSimilar
                              );
                            }}
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
                        <div key={tx.id} className="px-4 py-2 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 hover:bg-gray-50">
                          <div className="flex items-start gap-2 sm:gap-3 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={selectedTransactionIds.has(tx.id)}
                              onChange={() => toggleTransactionSelection(tx.id)}
                              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              aria-label={`בחר תנועה ${tx.description}`}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                <span className="text-xs sm:text-sm text-gray-400">
                                  {formatDate(tx.date)}
                                </span>
                                <DescriptionEditTrigger
                                  value={tx.description}
                                  onEdit={() => openDescriptionEditor(tx)}
                                  className="text-sm text-gray-700 break-words min-w-0 hover:text-blue-700 transition-colors"
                                />
                              </div>
                              <div className="mt-1">
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
                                    className="text-xs text-gray-500 border-b border-gray-300 focus:border-blue-500 outline-none w-full max-w-xs bg-transparent py-0.5"
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
                            </div>
                          </div>
                          <div className="flex items-center justify-between lg:justify-end gap-3 sm:gap-4">
                            <CategorySelector
                              transactionId={tx.id}
                              transactionDescription={tx.description}
                              currentCategory={tx.category}
                              categories={categories as Category[]}
                              defaultApplyToSimilar={false}
                              onCategoryChange={handleCategoryChange}
                            />
                            <span className={`text-sm font-medium whitespace-nowrap ${txIsExpense ? 'text-red-600' : 'text-green-600'}`}>
                              {txIsExpense ? '' : '+'}{formatCurrency(Math.abs(amount))}
                            </span>
                          </div>
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

      {editingDescriptionTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            onClick={closeDescriptionEditor}
            aria-label="סגור חלון עריכת שם עסקה"
          />

          <div className="relative w-full max-w-lg bg-white rounded-xl border border-gray-200 shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">עריכת שם עסקה</h3>
                <p className="text-sm text-gray-500">
                  אפשר לתקן שם שנקלט בלי רווחים או לאחד וריאציות של אותו בית עסק
                </p>
              </div>
              <button
                type="button"
                onClick={closeDescriptionEditor}
                className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
                disabled={isSavingDescription}
                aria-label="סגור"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              <div className="font-medium">שם נוכחי</div>
              <div className="mt-1 break-words text-blue-800">{editingDescriptionTransaction.description}</div>
            </div>

            <label className="space-y-1 block">
              <span className="text-xs text-gray-600">שם חדש</span>
              <input
                type="text"
                value={descriptionValue}
                onChange={(e) => setDescriptionValue(stripTrailingFinalDot(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleDescriptionSave();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    closeDescriptionEditor();
                  }
                }}
                placeholder="למשל: אייזקס מעדני גורמה"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
                disabled={isSavingDescription}
              />
            </label>

            <label className="flex items-start gap-3 rounded-lg border border-gray-200 px-3 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={applyDescriptionToSimilar}
                onChange={(e) => setApplyDescriptionToSimilar(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                disabled={isSavingDescription}
              />
              <div className="space-y-1">
                <div className="text-sm font-medium text-gray-900">
                  החל גם על עסקאות דומות מאותו מקום
                </div>
                <p className="text-xs text-gray-500">
                  אם כבר קיימת עסקה זהה עם השם החדש, המערכת תחבר אליה את הרשומה ותשמור את הקטגוריה הקיימת.
                </p>
              </div>
            </label>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeDescriptionEditor}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                disabled={isSavingDescription}
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={() => void handleDescriptionSave()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={isSavingDescription}
              >
                {isSavingDescription ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    שומר...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    שמור שם חדש
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            onClick={closeManualModal}
            aria-label="סגור חלון הוספת תנועה ידנית"
          />

          <div className="relative w-full max-w-xl bg-white rounded-xl border border-gray-200 shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">הוספת תנועה ידנית</h3>
                <p className="text-sm text-gray-500">הכנסה או הוצאה שלא הופיעה בקבצים שהעלית</p>
              </div>
              <button
                type="button"
                onClick={closeManualModal}
                className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
                disabled={isCreatingManualTransaction}
                aria-label="סגור"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setManualType('expense')}
                className={`px-3 py-2 rounded-lg border text-sm font-medium ${
                  manualType === 'expense'
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                הוצאה
              </button>
              <button
                type="button"
                onClick={() => setManualType('income')}
                className={`px-3 py-2 rounded-lg border text-sm font-medium ${
                  manualType === 'income'
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                הכנסה
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs text-gray-600">סכום</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-gray-600">תאריך</span>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </label>
            </div>

            <label className="space-y-1 block">
              <span className="text-xs text-gray-600">תיאור</span>
              <input
                type="text"
                value={manualDescription}
                onChange={(e) => setManualDescription(stripTrailingFinalDot(e.target.value))}
                placeholder="למשל: תשלום במזומן"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs text-gray-600">חשבון</span>
                <select
                  value={manualAccountId}
                  onChange={(e) => setManualAccountId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="manual">ידני / מזומן</option>
                  {manualAccountOptions.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs text-gray-600">קטגוריה (אופציונלי)</span>
                <select
                  value={manualCategoryId}
                  onChange={(e) => setManualCategoryId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">ללא קטגוריה</option>
                  {manualCategoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.icon || '📁'} {category.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="space-y-1 block">
              <span className="text-xs text-gray-600">הערה (אופציונלי)</span>
              <input
                type="text"
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                placeholder="למשל: עסקה במזומן ללא קבלה"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </label>

            {manualType === 'expense' && (
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={manualIsRecurring}
                  onChange={(e) => setManualIsRecurring(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                לסמן כהוצאה קבועה
              </label>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeManualModal}
                disabled={isCreatingManualTransaction}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleCreateManualTransaction}
                disabled={isCreatingManualTransaction}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 inline-flex items-center gap-2"
              >
                {isCreatingManualTransaction && <Loader2 className="h-4 w-4 animate-spin" />}
                {isCreatingManualTransaction ? 'שומר...' : 'הוסף תנועה'}
              </button>
            </div>
          </div>
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
