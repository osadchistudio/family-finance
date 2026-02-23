'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Save } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';

interface BudgetCategoryOption {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface BudgetPeriodOption {
  key: string;
  label: string;
  subLabel: string;
  isCurrent: boolean;
}

interface BudgetPlanSnapshot {
  periodKey: string;
  updatedAt: string;
  items: Record<string, number>;
}

interface MonthSummaryLike {
  monthKey: string;
  isDataComplete: boolean;
  transactionCount: number;
}

interface CategoryBreakdownItem {
  id: string;
  name: string;
  value: number;
  color: string;
  icon: string;
}

interface VariableBudgetPlannerProps {
  categories: BudgetCategoryOption[];
  periodOptions: BudgetPeriodOption[];
  initialPlansByPeriod: Record<string, BudgetPlanSnapshot>;
  months: MonthSummaryLike[];
  categoryBreakdowns: Record<string, CategoryBreakdownItem[]>;
}

function formatPeriodLabel(period: BudgetPeriodOption) {
  return `${period.label} ${period.subLabel}`.trim();
}

function normalizeDraftItems(items: Record<string, number>, categories: BudgetCategoryOption[]) {
  const categoryIds = new Set(categories.map((category) => category.id));
  const normalized: Record<string, number> = {};

  for (const [categoryId, amount] of Object.entries(items)) {
    if (!categoryIds.has(categoryId)) continue;
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) continue;
    normalized[categoryId] = Number(parsedAmount.toFixed(2));
  }

  return normalized;
}

export function VariableBudgetPlanner({
  categories,
  periodOptions,
  initialPlansByPeriod,
  months,
  categoryBreakdowns,
}: VariableBudgetPlannerProps) {
  const defaultPeriodKey = periodOptions.find((period) => period.isCurrent)?.key || periodOptions[0]?.key || '';
  const [selectedPeriodKey, setSelectedPeriodKey] = useState(defaultPeriodKey);
  const [plansByPeriod, setPlansByPeriod] = useState<Record<string, BudgetPlanSnapshot>>(initialPlansByPeriod);
  const [draftItems, setDraftItems] = useState<Record<string, number>>(
    initialPlansByPeriod[defaultPeriodKey]?.items || {}
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const selectedPeriod = useMemo(
    () => periodOptions.find((period) => period.key === selectedPeriodKey) || null,
    [periodOptions, selectedPeriodKey]
  );

  useEffect(() => {
    setDraftItems(plansByPeriod[selectedPeriodKey]?.items || {});
    setStatusMessage(null);
  }, [selectedPeriodKey, plansByPeriod]);

  const monthsWithData = useMemo(
    () => months.filter((month) => month.transactionCount > 0),
    [months]
  );
  const completeMonthsWithData = useMemo(
    () => monthsWithData.filter((month) => month.isDataComplete),
    [monthsWithData]
  );
  const averageBaseMonths = completeMonthsWithData.length > 0 ? completeMonthsWithData : monthsWithData;
  const averageBaseCount = Math.max(averageBaseMonths.length, 1);

  const categoryAverageById = useMemo(() => {
    const totals = new Map<string, number>();
    for (const month of averageBaseMonths) {
      const breakdown = categoryBreakdowns[month.monthKey] || [];
      for (const item of breakdown) {
        totals.set(item.id, (totals.get(item.id) || 0) + item.value);
      }
    }

    return Object.fromEntries(
      categories.map((category) => [category.id, (totals.get(category.id) || 0) / averageBaseCount])
    ) as Record<string, number>;
  }, [averageBaseMonths, averageBaseCount, categoryBreakdowns, categories]);

  const selectedPeriodBreakdown = useMemo(() => {
    const breakdown = categoryBreakdowns[selectedPeriodKey] || [];
    return Object.fromEntries(breakdown.map((item) => [item.id, item.value])) as Record<string, number>;
  }, [categoryBreakdowns, selectedPeriodKey]);

  const filteredCategories = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    if (!normalized) return categories;
    return categories.filter((category) => (
      category.name.toLowerCase().includes(normalized)
      || category.icon.toLowerCase().includes(normalized)
    ));
  }, [categories, searchTerm]);

  const rows = useMemo(() => (
    filteredCategories.map((category) => {
      const planned = Number(draftItems[category.id] || 0);
      const actual = Number(selectedPeriodBreakdown[category.id] || 0);
      const suggested = Number(categoryAverageById[category.id] || 0);
      const remaining = planned - actual;
      const ratio = planned > 0 ? actual / planned : 0;

      return {
        category,
        planned,
        actual,
        suggested,
        remaining,
        ratio,
      };
    })
  ), [filteredCategories, draftItems, selectedPeriodBreakdown, categoryAverageById]);

  const plannedTotal = useMemo(
    () => Object.values(draftItems).reduce((sum, value) => sum + Number(value || 0), 0),
    [draftItems]
  );
  const actualTotal = useMemo(
    () => rows.reduce((sum, row) => sum + (row.planned > 0 ? row.actual : 0), 0),
    [rows]
  );
  const remainingTotal = plannedTotal - actualTotal;
  const utilization = plannedTotal > 0 ? (actualTotal / plannedTotal) * 100 : 0;

  const setCategoryBudget = (categoryId: string, inputValue: string) => {
    const normalizedInput = inputValue.replace(/[^\d.]/g, '');
    const parsed = Number(normalizedInput);

    setDraftItems((prev) => {
      const next = { ...prev };
      if (!Number.isFinite(parsed) || parsed <= 0) {
        delete next[categoryId];
        return next;
      }
      next[categoryId] = Number(parsed.toFixed(2));
      return next;
    });
  };

  const fillByAverage = () => {
    const next: Record<string, number> = {};
    for (const category of categories) {
      const suggested = Number(categoryAverageById[category.id] || 0);
      if (suggested <= 0) continue;
      next[category.id] = Number(suggested.toFixed(0));
    }
    setDraftItems(next);
    setStatusMessage(null);
  };

  const clearPlan = () => {
    setDraftItems({});
    setStatusMessage(null);
  };

  const copyFromCurrent = () => {
    const currentPeriod = periodOptions.find((period) => period.isCurrent);
    if (!currentPeriod || currentPeriod.key === selectedPeriodKey) return;
    const currentItems = plansByPeriod[currentPeriod.key]?.items || {};
    setDraftItems({ ...currentItems });
    setStatusMessage(null);
  };

  const handleSave = async () => {
    if (!selectedPeriodKey) return;

    setIsSaving(true);
    setStatusMessage(null);

    try {
      const normalizedItems = normalizeDraftItems(draftItems, categories);
      const payload = {
        periodKey: selectedPeriodKey,
        items: Object.entries(normalizedItems).map(([categoryId, amount]) => ({ categoryId, amount })),
      };

      const response = await fetch('/api/budgets/variable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Failed to save');
      }

      const data = await response.json();
      const plan = data?.plan as BudgetPlanSnapshot | undefined;
      if (!plan || !plan.periodKey) {
        throw new Error('Invalid response');
      }

      setPlansByPeriod((prev) => ({
        ...prev,
        [plan.periodKey]: {
          periodKey: plan.periodKey,
          updatedAt: plan.updatedAt || new Date().toISOString(),
          items: plan.items || {},
        },
      }));
      setDraftItems(plan.items || {});
      setStatusMessage({ type: 'success', text: 'התקציב נשמר בהצלחה' });
    } catch {
      setStatusMessage({ type: 'error', text: 'שגיאה בשמירת התקציב' });
    } finally {
      setIsSaving(false);
    }
  };

  const lastUpdatedAt = plansByPeriod[selectedPeriodKey]?.updatedAt || '';

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">תכנון תקציב לקטגוריות משתנות</h3>
          <p className="text-sm text-gray-500 mt-1">
            קבע יעד הוצאות לכל קטגוריה והשווה מול הביצוע בפועל
          </p>
        </div>
        {lastUpdatedAt && (
          <p className="text-xs text-gray-400">
            עודכן לאחרונה: {new Date(lastUpdatedAt).toLocaleDateString('he-IL')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="rounded-lg border border-gray-100 p-3">
          <p className="text-xs text-gray-500">תקציב משתנות</p>
          <p className="text-lg font-bold text-gray-900 mt-1">{formatCurrency(plannedTotal)}</p>
        </div>
        <div className="rounded-lg border border-gray-100 p-3">
          <p className="text-xs text-gray-500">בוצע בפועל</p>
          <p className="text-lg font-bold text-red-600 mt-1">{formatCurrency(actualTotal)}</p>
        </div>
        <div className="rounded-lg border border-gray-100 p-3">
          <p className="text-xs text-gray-500">נותר לתקופה</p>
          <p className={`text-lg font-bold mt-1 ${remainingTotal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {remainingTotal >= 0 ? '' : '-'}{formatCurrency(Math.abs(remainingTotal))}
          </p>
        </div>
        <div className="rounded-lg border border-gray-100 p-3">
          <p className="text-xs text-gray-500">ניצול תקציב</p>
          <p className={`text-lg font-bold mt-1 ${utilization > 100 ? 'text-red-600' : 'text-gray-900'}`}>
            {utilization.toFixed(0)}%
          </p>
        </div>
      </div>

      <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full transition-all ${utilization > 100 ? 'bg-red-500' : utilization > 85 ? 'bg-amber-500' : 'bg-green-500'}`}
          style={{ width: `${Math.min(100, Math.max(0, utilization))}%` }}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
        <select
          value={selectedPeriodKey}
          onChange={(event) => setSelectedPeriodKey(event.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          {periodOptions.map((period) => (
            <option key={period.key} value={period.key}>
              {formatPeriodLabel(period)}
            </option>
          ))}
        </select>

        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="חיפוש קטגוריה"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />

        <button
          type="button"
          onClick={fillByAverage}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
        >
          מלא לפי ממוצע
        </button>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={clearPlan}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
          >
            אפס תקציב
          </button>
          <button
            type="button"
            onClick={copyFromCurrent}
            disabled={!selectedPeriod || selectedPeriod.isCurrent}
            className={`flex-1 px-3 py-2 border rounded-lg text-sm transition-colors ${
              selectedPeriod && !selectedPeriod.isCurrent
                ? 'border-blue-300 text-blue-700 hover:bg-blue-50'
                : 'border-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            העתק מנוכחי
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
          statusMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      <div className="border border-gray-100 rounded-lg overflow-hidden">
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)] gap-2 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
          <span>קטגוריה</span>
          <span className="text-left">מומלץ</span>
          <span className="text-left">תקציב</span>
          <span className="text-left">בפועל</span>
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {rows.length === 0 ? (
            <div className="px-3 py-8 text-sm text-gray-500 text-center">לא נמצאו קטגוריות</div>
          ) : (
            rows.map((row) => (
              <div
                key={row.category.id}
                className="grid grid-cols-[minmax(0,2fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)] gap-2 items-center px-3 py-2 border-t border-gray-100"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {row.category.icon} {row.category.name}
                  </p>
                  {row.planned > 0 && (
                    <p className={`text-xs mt-0.5 ${row.remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {row.remaining >= 0 ? 'נותר' : 'חריגה'}: {formatCurrency(Math.abs(row.remaining))}
                    </p>
                  )}
                </div>

                <div className="text-sm text-gray-500 text-left">{formatCurrency(row.suggested)}</div>

                <div className="text-left">
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={row.planned > 0 ? row.planned : ''}
                    onChange={(event) => setCategoryBudget(row.category.id, event.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                    placeholder="0"
                  />
                </div>

                <div className={`text-sm text-left ${row.planned > 0 && row.ratio > 1 ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                  {formatCurrency(row.actual)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            isSaving
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          שמור תקציב
        </button>
      </div>
    </div>
  );
}
