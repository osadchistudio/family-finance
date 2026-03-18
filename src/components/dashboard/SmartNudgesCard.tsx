'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Lightbulb,
  Loader2,
  ReceiptText,
  RefreshCcw,
  UploadCloud,
} from 'lucide-react';
import { showToast } from '@/components/ui/Toast';

export interface SmartNudge {
  key: string;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  tone: 'info' | 'warning' | 'danger';
  snoozeKey?: string;
}

export interface SmartNudgesStatus {
  periodLabel: string;
  nudges: SmartNudge[];
}

function toneClasses(tone: SmartNudge['tone']) {
  if (tone === 'danger') {
    return {
      card: 'border-red-200 bg-red-50',
      iconWrap: 'bg-white text-red-600',
      action: 'border-red-200 text-red-700 hover:bg-red-100',
    };
  }

  if (tone === 'warning') {
    return {
      card: 'border-amber-200 bg-amber-50',
      iconWrap: 'bg-white text-amber-700',
      action: 'border-amber-200 text-amber-800 hover:bg-amber-100',
    };
  }

  return {
    card: 'border-blue-200 bg-blue-50',
    iconWrap: 'bg-white text-blue-600',
    action: 'border-blue-200 text-blue-700 hover:bg-blue-100',
  };
}

function getNudgeIcon(key: string) {
  switch (key) {
    case 'missing-sources':
      return UploadCloud;
    case 'failed-uploads':
      return RefreshCcw;
    case 'stale-uploads':
      return Clock3;
    case 'uncategorized':
      return ReceiptText;
    case 'budget-overrun':
    case 'budget-warning':
    default:
      return AlertTriangle;
  }
}

export function SmartNudgesCard({ status }: { status: SmartNudgesStatus }) {
  const [visibleNudges, setVisibleNudges] = useState(status.nudges);
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [pendingActionType, setPendingActionType] = useState<'snooze' | 'dismiss' | null>(null);

  useEffect(() => {
    setVisibleNudges(status.nudges);
  }, [status.nudges]);

  async function handleStateChange(nudge: SmartNudge, action: 'snooze' | 'dismiss') {
    if (!nudge.snoozeKey || pendingActionKey) {
      return;
    }

    setPendingActionKey(nudge.snoozeKey);
    setPendingActionType(action);

    try {
      const response = await fetch('/api/dashboard/smart-nudges-snooze', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nudgeKey: nudge.snoozeKey,
          action,
          ...(action === 'snooze' ? { snoozeDays: 7 } : {}),
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to ${action} smart nudge`);
      }

      setVisibleNudges((current) =>
        current.filter((item) => (item.snoozeKey || item.key) !== nudge.snoozeKey)
      );
      showToast(action === 'snooze' ? 'ההתראה הושתה לשבוע' : 'ההתראה נסגרה לתקופה', 'success');
    } catch (error) {
      console.error(`Smart nudge ${action} error:`, error);
      showToast(
        action === 'snooze'
          ? 'לא הצלחנו להשהות את ההתראה כרגע'
          : 'לא הצלחנו לסגור את ההתראה כרגע',
        'error'
      );
    } finally {
      setPendingActionKey(null);
      setPendingActionType(null);
    }
  }

  if (visibleNudges.length === 0) {
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-white p-2 text-blue-600 shadow-sm">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-gray-900">
              <h3 className="text-base font-semibold sm:text-lg">התראות חכמות</h3>
              <Lightbulb className="h-4 w-4 text-blue-600" />
            </div>
            <p className="mt-1 text-sm text-gray-500">תקופה נוכחית: {status.periodLabel}</p>
            <p className="mt-3 text-sm text-blue-900">
              כרגע אין סימנים מיוחדים שדורשים תשומת לב. הקצב, המקורות, והקליטה נראים יציבים.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-gray-900">
            <h3 className="text-base font-semibold sm:text-lg">התראות חכמות</h3>
            <Lightbulb className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-1 text-sm text-gray-500">תקופה נוכחית: {status.periodLabel}</p>
        </div>
        <span className="inline-flex w-fit items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
          {visibleNudges.length} תובנות פעילות
        </span>
      </div>

      <p className="mt-3 text-sm text-gray-600">
        אלו סימנים חכמים שהמערכת מזהה עכשיו, לפני שהם הופכים לבעיה אמיתית או לפספוס בתמונת המצב.
      </p>

      <div className="mt-4 grid gap-3">
        {visibleNudges.map((nudge) => {
          const Icon = getNudgeIcon(nudge.key);
          const classes = toneClasses(nudge.tone);
          const isPending = pendingActionKey === nudge.snoozeKey;

          return (
            <div
              key={nudge.snoozeKey || nudge.key}
              className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${classes.card}`}
            >
              <div className="flex items-start gap-3">
                <div className={`rounded-full p-2 shadow-sm ${classes.iconWrap}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">{nudge.title}</h4>
                  <p className="mt-1 text-sm text-gray-600">{nudge.description}</p>
                </div>
              </div>

              <div className="flex shrink-0 flex-col gap-2 sm:min-w-44">
                {nudge.snoozeKey ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleStateChange(nudge, 'dismiss')}
                      disabled={isPending}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isPending && pendingActionType === 'dismiss' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      סגור לתקופה
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStateChange(nudge, 'snooze')}
                      disabled={isPending}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isPending && pendingActionType === 'snooze' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Clock3 className="h-4 w-4" />
                      )}
                      השהה לשבוע
                    </button>
                  </>
                ) : null}

                <Link
                  href={nudge.href}
                  className={`inline-flex items-center justify-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-medium transition ${classes.action}`}
                >
                  {nudge.actionLabel}
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
