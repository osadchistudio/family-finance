'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Target } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';

export interface VariableBudgetAlert {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  planned: number;
  actual: number;
  remaining: number;
  utilizationPercent: number;
  severity: 'warning' | 'over';
}

export interface VariableBudgetStatus {
  hasPlan: boolean;
  periodKey: string;
  periodLabel: string;
  updatedAt: string;
  plannedTotal: number;
  actualTotal: number;
  remainingTotal: number;
  utilizationPercent: number;
  warningCount: number;
  overCount: number;
  alerts: VariableBudgetAlert[];
}

interface VariableBudgetStatusCardProps {
  status: VariableBudgetStatus;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0%';
  return `${value.toFixed(0)}%`;
}

export function VariableBudgetStatusCard({ status }: VariableBudgetStatusCardProps) {
  if (!status.hasPlan) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-blue-100">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900">עמידה בתקציב משתנות</h3>
            <p className="text-sm text-gray-500 mt-1">תקופה נוכחית: {status.periodLabel}</p>
            <p className="text-sm text-gray-600 mt-3">אין עדיין תקציב משתנות לתקופה הזו</p>
          </div>
          <div className="p-2.5 rounded-full bg-blue-50 text-blue-600">
            <Target className="h-5 w-5" />
          </div>
        </div>

        <div className="mt-4">
          <Link
            href="/monthly-summary"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            הגדר תקציב חודשי
          </Link>
        </div>
      </div>
    );
  }

  const visibleAlerts = status.alerts.slice(0, 4);
  const hasAlerts = status.alerts.length > 0;
  const progressWidth = Math.max(0, Math.min(100, status.utilizationPercent));

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">עמידה בתקציב משתנות</h3>
          <p className="text-sm text-gray-500 mt-1">תקופה נוכחית: {status.periodLabel}</p>
        </div>
        <div className="p-2.5 rounded-full bg-indigo-50 text-indigo-600">
          <Target className="h-5 w-5" />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
        <div className="rounded-lg border border-gray-100 p-3">
          <p className="text-xs text-gray-500">תקציב</p>
          <p className="text-lg font-bold text-gray-900 mt-1">{formatCurrency(status.plannedTotal)}</p>
        </div>
        <div className="rounded-lg border border-gray-100 p-3">
          <p className="text-xs text-gray-500">בוצע</p>
          <p className="text-lg font-bold text-red-600 mt-1">{formatCurrency(status.actualTotal)}</p>
        </div>
        <div className="rounded-lg border border-gray-100 p-3">
          <p className="text-xs text-gray-500">נותר</p>
          <p className={`text-lg font-bold mt-1 ${status.remainingTotal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {status.remainingTotal >= 0 ? '' : '-'}{formatCurrency(Math.abs(status.remainingTotal))}
          </p>
        </div>
        <div className="rounded-lg border border-gray-100 p-3">
          <p className="text-xs text-gray-500">ניצול</p>
          <p className={`text-lg font-bold mt-1 ${status.utilizationPercent > 100 ? 'text-red-600' : 'text-gray-900'}`}>
            {formatPercent(status.utilizationPercent)}
          </p>
        </div>
      </div>

      <div className="mt-3 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full transition-all ${status.utilizationPercent > 100 ? 'bg-red-500' : status.utilizationPercent >= 85 ? 'bg-amber-500' : 'bg-green-500'}`}
          style={{ width: `${progressWidth}%` }}
        />
      </div>

      {hasAlerts ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-2 text-amber-800 mb-2">
            <AlertTriangle className="h-4 w-4" />
            <p className="text-sm font-medium">
              התראות בזמן אמת · {status.overCount} חריגה · {status.warningCount} מתקרב לתקרה
            </p>
          </div>
          <div className="space-y-2">
            {visibleAlerts.map((alert) => (
              <div key={alert.categoryId} className="flex items-center justify-between gap-2 text-sm">
                <p className="text-gray-800 truncate">
                  {alert.categoryIcon} {alert.categoryName}
                </p>
                <p className={`shrink-0 font-medium ${alert.severity === 'over' ? 'text-red-600' : 'text-amber-700'}`}>
                  {formatCurrency(alert.actual)} / {formatCurrency(alert.planned)}
                </p>
              </div>
            ))}
            {status.alerts.length > visibleAlerts.length && (
              <p className="text-xs text-amber-700">ועוד {status.alerts.length - visibleAlerts.length} קטגוריות</p>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 flex items-center gap-2 text-green-700">
          <CheckCircle2 className="h-4 w-4" />
          <p className="text-sm">אין חריגות תקציב כרגע בקטגוריות שתוכננו</p>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <Link
          href="/monthly-summary"
          className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-blue-200 text-blue-700 text-sm font-medium hover:bg-blue-50 transition-colors"
        >
          ניהול תקציב משתנות
        </Link>
        {status.updatedAt && (
          <p className="text-xs text-gray-400">
            עודכן: {new Date(status.updatedAt).toLocaleDateString('he-IL')}
          </p>
        )}
      </div>
    </div>
  );
}
