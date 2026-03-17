'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, CalendarClock, CreditCard, Landmark, Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';

export interface CurrentPeriodStatus {
  periodLabel: string;
  dateRangeLabel: string;
  income: number;
  expense: number;
  balance: number;
  averageDailyExpense: number;
  remainingDailyBudget: number | null;
  totalDays: number;
  elapsedDays: number;
  remainingDays: number;
  transactionCount: number;
  hasAnyData: boolean;
  expectsBankData: boolean;
  expectsCreditData: boolean;
  hasBankData: boolean;
  hasCreditData: boolean;
  missingSources: string[];
  isPartial: boolean;
}

interface CurrentPeriodStatusCardProps {
  status: CurrentPeriodStatus;
}

function SourceBadge({
  label,
  active,
  icon,
}: {
  label: string;
  active: boolean;
  icon: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
        active ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
      }`}
    >
      {icon}
      {label}
      <span>{active ? 'קיים' : 'חסר'}</span>
    </span>
  );
}

function Metric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'income' | 'expense' | 'balance';
}) {
  const toneClass =
    tone === 'income'
      ? 'text-green-600'
      : tone === 'expense'
        ? 'text-red-600'
        : tone === 'balance'
          ? 'text-blue-700'
          : 'text-gray-900';

  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

export function CurrentPeriodStatusCard({ status }: CurrentPeriodStatusCardProps) {
  const progressPercent = status.totalDays > 0 ? Math.min(100, (status.elapsedDays / status.totalDays) * 100) : 0;

  const sourceBadges = [
    status.expectsBankData
      ? {
          key: 'bank',
          label: 'עו"ש',
          active: status.hasBankData,
          icon: <Landmark className="h-3.5 w-3.5" />,
        }
      : null,
    status.expectsCreditData
      ? {
          key: 'credit',
          label: 'אשראי',
          active: status.hasCreditData,
          icon: <CreditCard className="h-3.5 w-3.5" />,
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    label: string;
    active: boolean;
    icon: ReactNode;
  }>;

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-100">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-gray-900">
            <CalendarClock className="h-5 w-5 text-blue-600" />
            <h3 className="text-base sm:text-lg font-semibold">תמונת מצב לתקופה הנוכחית</h3>
          </div>
          <p className="text-sm text-gray-500 mt-1">{status.periodLabel}</p>
          <p className="text-xs text-gray-400 mt-1">{status.dateRangeLabel}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:min-w-[240px]">
          <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
            <p className="text-xs text-gray-500">ימים נותרו</p>
            <p className="mt-1 text-2xl font-bold text-blue-700">{status.remainingDays}</p>
          </div>
          <div className="rounded-lg border border-gray-100 p-3">
            <p className="text-xs text-gray-500">תנועות שנקלטו</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{status.transactionCount}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full bg-blue-500 transition-all" style={{ width: `${progressPercent}%` }} />
      </div>
      <p className="mt-2 text-xs text-gray-500">
        עברו {status.elapsedDays} מתוך {status.totalDays} ימים בתקופה
      </p>

      <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric label="הכנסות עד כה" value={formatCurrency(status.income)} tone="income" />
        <Metric label="הוצאות עד כה" value={formatCurrency(status.expense)} tone="expense" />
        <Metric label="יתרה כרגע" value={formatCurrency(Math.abs(status.balance))} tone="balance" />
        <Metric label="קצב הוצאה יומי" value={formatCurrency(status.averageDailyExpense)} tone="neutral" />
      </div>

      <div className="mt-3 rounded-lg border border-gray-100 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-gray-500">כמה נשאר להוציא עד סוף התקופה</p>
            <p className={`mt-1 text-lg font-bold ${status.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {status.balance >= 0 ? formatCurrency(status.balance) : `-${formatCurrency(Math.abs(status.balance))}`}
            </p>
          </div>
          <div className="text-left">
            <p className="text-xs text-gray-500">מסגרת יומית נותרת</p>
            <p
              className={`mt-1 text-sm font-semibold ${
                status.remainingDailyBudget !== null && status.remainingDailyBudget >= 0
                  ? 'text-green-700'
                  : 'text-red-600'
              }`}
            >
              {status.remainingDailyBudget === null
                ? 'אין ימים נותרים'
                : status.remainingDailyBudget >= 0
                  ? formatCurrency(status.remainingDailyBudget)
                  : `-${formatCurrency(Math.abs(status.remainingDailyBudget))}`}
            </p>
          </div>
        </div>
      </div>

      <div
        className={`mt-4 rounded-lg border p-3 ${
          status.isPartial
            ? 'border-amber-200 bg-amber-50'
            : status.hasAnyData
              ? 'border-green-200 bg-green-50'
              : 'border-blue-200 bg-blue-50'
        }`}
      >
        <div className="flex items-start gap-2">
          {status.isPartial ? (
            <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-700 shrink-0" />
          ) : (
            <Wallet className="h-4 w-4 mt-0.5 text-blue-700 shrink-0" />
          )}
          <div className="w-full">
            <p className="text-sm font-medium text-gray-900">
              {status.isPartial
                ? `התקופה חלקית כרגע: חסר ${status.missingSources.join(' ו־')}`
                : status.hasAnyData
                  ? 'התקופה כוללת את כל מקורות הנתונים הפעילים'
                  : 'עדיין לא נקלטו תנועות לתקופה הזו'}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              {status.isPartial
                ? 'כל עוד חסרים מקורות, כדאי להיזהר בפרשנות של היתרה והקצב היומי'
                : status.hasAnyData
                  ? 'הנתונים הנוכחיים מתאימים לקבלת תמונת מצב שוטפת'
                  : 'ברגע שיעלו עו"ש או אשראי לתקופה הזו, הכרטיס יתעדכן אוטומטית'}
            </p>

            {sourceBadges.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {sourceBadges.map((badge) => (
                  <SourceBadge
                    key={badge.key}
                    label={badge.label}
                    active={badge.active}
                    icon={badge.icon}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
