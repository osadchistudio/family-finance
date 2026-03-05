'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type RecoveryActionStatus =
  | 'db_active'
  | 'recovery_requested'
  | 'project_already_active'
  | 'recovery_failed'
  | 'recovery_config_missing'
  | 'db_error_unrecoverable'
  | 'recovery_throttled';

interface RecoveryActionResponse {
  status: RecoveryActionStatus;
  dbError?: string | null;
  projectStatus?: string | null;
  details?: string | null;
  retryInSeconds?: number;
}

interface RecoveryHealthResponse {
  dbState: 'up' | 'down';
  dbError: string | null;
  likelyPausedError: boolean;
  managementConfigured: boolean;
  projectStatus: string | null;
  projectStatusError: string | null;
}

const HEALTH_POLL_INTERVAL_MS = 7000;
const MAX_POLL_ATTEMPTS = 10;

function summarizeStatus(payload: RecoveryActionResponse): string {
  switch (payload.status) {
    case 'db_active':
      return 'מסד הנתונים חזר לפעול, טוען מחדש';
    case 'recovery_requested':
      return 'נשלחה בקשה להפעיל את פרויקט Supabase';
    case 'project_already_active':
      return 'Supabase כבר פעיל, מבצע בדיקה נוספת בעוד רגע';
    case 'recovery_config_missing':
      return 'חסר קונפיגורציה להתאוששות אוטומטית';
    case 'db_error_unrecoverable':
      return 'זוהתה שגיאת מסד נתונים שלא תואמת לפרויקט מושהה';
    case 'recovery_failed':
      return 'ניסיון ההפעלה האוטומטי נכשל';
    case 'recovery_throttled':
      return `ניסיון התאוששות כבר רץ, נסה שוב בעוד ${payload.retryInSeconds ?? 30} שניות`;
    default:
      return 'שגיאה זמנית בטעינת המערכת';
  }
}

export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [statusText, setStatusText] = useState('בודק מצב מסד נתונים');
  const [detailsText, setDetailsText] = useState<string | null>(null);
  const [isRunningRecovery, setIsRunningRecovery] = useState(false);
  const [isAutoPolling, setIsAutoPolling] = useState(false);
  const [hasAutoAttempted, setHasAutoAttempted] = useState(false);
  const pollAttemptsRef = useRef(0);

  const digestText = useMemo(() => error?.digest || null, [error]);

  const checkHealth = useCallback(async () => {
    try {
      const response = await fetch('/api/system/supabase-recovery', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = (await response.json()) as RecoveryHealthResponse;

      if (payload.dbState === 'up') {
        setStatusText('מסד הנתונים פעיל, טוען מחדש');
        setDetailsText(null);
        setTimeout(() => {
          window.location.reload();
        }, 350);
        return true;
      }

      setStatusText('מסד הנתונים עדיין לא זמין');
      if (payload.projectStatus) {
        setDetailsText(`סטטוס Supabase: ${payload.projectStatus}`);
      } else if (!payload.managementConfigured) {
        setDetailsText('חסר SUPABASE_PROJECT_REF או SUPABASE_MANAGEMENT_TOKEN בשרת');
      } else {
        setDetailsText('לא התקבל סטטוס פרויקט מ־Supabase');
      }
      return false;
    } catch {
      setStatusText('בדיקת מצב נכשלה');
      setDetailsText('לא ניתן לבדוק כרגע את מצב השרת');
      return false;
    }
  }, []);

  const triggerRecovery = useCallback(async () => {
    setIsRunningRecovery(true);

    try {
      const response = await fetch('/api/system/supabase-recovery', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const payload = (await response.json()) as RecoveryActionResponse;
      setStatusText(summarizeStatus(payload));

      if (payload.details) {
        setDetailsText(payload.details);
      } else if (payload.projectStatus) {
        setDetailsText(`סטטוס Supabase: ${payload.projectStatus}`);
      } else {
        setDetailsText(null);
      }

      if (payload.status === 'db_active') {
        setTimeout(() => {
          window.location.reload();
        }, 350);
        return;
      }

      if (payload.status === 'recovery_requested' || payload.status === 'project_already_active') {
        pollAttemptsRef.current = 0;
        setIsAutoPolling(true);
      }
    } catch {
      setStatusText('הפעלת התאוששות אוטומטית נכשלה');
      setDetailsText('אפשר לנסות שוב או להפעיל את הפרויקט ידנית ב־Supabase');
    } finally {
      setIsRunningRecovery(false);
    }
  }, []);

  useEffect(() => {
    if (hasAutoAttempted) return;
    setHasAutoAttempted(true);
    void triggerRecovery();
  }, [hasAutoAttempted, triggerRecovery]);

  useEffect(() => {
    if (!isAutoPolling) return;

    const interval = setInterval(async () => {
      pollAttemptsRef.current += 1;
      const isUp = await checkHealth();
      if (isUp || pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
        setIsAutoPolling(false);
      }
    }, HEALTH_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [checkHealth, isAutoPolling]);

  return (
    <div className="max-w-xl mx-auto mt-8 sm:mt-16 bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 shadow-sm space-y-4">
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900">המערכת זמנית לא זמינה</h2>
      <p className="text-sm sm:text-base text-gray-600">
        זוהתה שגיאת שרת, מתבצעת בדיקת התאוששות אוטומטית מול Supabase כדי למנוע מסך לבן
      </p>

      <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 space-y-2">
        <p className="text-sm font-medium text-gray-800">{statusText}</p>
        {detailsText && <p className="text-xs sm:text-sm text-gray-600 break-words">{detailsText}</p>}
        {digestText && <p className="text-xs text-gray-500">Digest: {digestText}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void triggerRecovery()}
          disabled={isRunningRecovery}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-60"
        >
          {isRunningRecovery ? 'מנסה להפעיל מחדש' : 'נסה התאוששות אוטומטית'}
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            window.location.reload();
          }}
          className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium"
        >
          טען מחדש
        </button>
      </div>
    </div>
  );
}
