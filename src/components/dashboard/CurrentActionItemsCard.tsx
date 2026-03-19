'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, UploadCloud, WalletCards } from 'lucide-react';

export interface CurrentActionItem {
  key: string;
  title: string;
  description: string;
  href: string;
  count: number;
  tone: 'warning' | 'danger' | 'info';
}

export interface CurrentActionItemsStatus {
  periodLabel: string;
  items: CurrentActionItem[];
  totalOpenItems: number;
}

function toneClasses(tone: CurrentActionItem['tone']) {
  if (tone === 'danger') {
    return {
      card: 'border-red-200 bg-red-50',
      badge: 'bg-red-100 text-red-700',
      icon: 'text-red-600',
    };
  }

  if (tone === 'info') {
    return {
      card: 'border-blue-200 bg-blue-50',
      badge: 'bg-blue-100 text-blue-700',
      icon: 'text-blue-600',
    };
  }

  return {
    card: 'border-amber-200 bg-amber-50',
    badge: 'bg-amber-100 text-amber-700',
    icon: 'text-amber-600',
  };
}

function getItemIcon(key: string) {
  switch (key) {
    case 'missing-sources':
      return UploadCloud;
    case 'failed-uploads':
      return Clock3;
    case 'budget-alerts':
      return WalletCards;
    case 'uncategorized':
    default:
      return AlertTriangle;
  }
}

function getActionLabel(key: string) {
  switch (key) {
    case 'missing-sources':
      return 'השלם נתונים';
    case 'failed-uploads':
      return 'בדוק העלאות';
    case 'budget-alerts':
      return 'בדוק תקציב';
    case 'uncategorized':
      return 'שייך תנועות';
    default:
      return 'פתח';
  }
}

export function CurrentActionItemsCard({ status }: { status: CurrentActionItemsStatus }) {
  if (status.items.length === 0) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-white p-2 text-green-600 shadow-sm">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900 sm:text-lg">לטיפול עכשיו</h3>
            <p className="mt-1 text-sm text-gray-500">תקופה נוכחית: {status.periodLabel}</p>
            <p className="mt-3 text-sm text-green-800">
              אין כרגע משימות פתוחות לטיפול. המצב השוטף של התקופה נראה יציב ומעודכן.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900 sm:text-lg">לטיפול עכשיו</h3>
          <p className="mt-1 text-sm text-gray-500">תקופה נוכחית: {status.periodLabel}</p>
        </div>
        <span className="inline-flex w-fit items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
          {status.totalOpenItems} נושאים פתוחים
        </span>
      </div>

      <p className="mt-3 text-sm text-gray-600">
        אלו הדברים שכדאי לסגור עכשיו כדי שהתמונה של התקופה תהיה מלאה, נקייה וקלה יותר לקבלת החלטות.
      </p>

      <div className="mt-4 grid gap-3">
        {status.items.map((item) => {
          const Icon = getItemIcon(item.key);
          const classes = toneClasses(item.tone);

          return (
            <div
              key={item.key}
              className={`rounded-xl border p-4 ${classes.card} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}
            >
              <div className="flex items-start gap-3">
                <div className={`rounded-full bg-white p-2 shadow-sm ${classes.icon}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-semibold text-gray-900">{item.title}</h4>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${classes.badge}`}>
                      {item.count}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{item.description}</p>
                </div>
              </div>

              <Link
                href={item.href}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
              >
                {getActionLabel(item.key)}
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
