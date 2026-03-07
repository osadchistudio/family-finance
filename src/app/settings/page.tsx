'use client';

import { useState, useEffect } from 'react';
import { Key, Eye, EyeOff, Save, CheckCircle, AlertCircle, Loader2, BellRing, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  DEFAULT_TELEGRAM_REMINDER_SETTINGS,
  REMINDER_WEEKDAY_OPTIONS,
  TelegramReminderSettings,
  formatReminderHour,
} from '@/lib/telegram-reminder-config';

type PeriodMode = 'calendar' | 'billing';

export default function SettingsPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('calendar');
  const [isLoadingPeriodMode, setIsLoadingPeriodMode] = useState(true);
  const [isSavingPeriodMode, setIsSavingPeriodMode] = useState(false);
  const [periodModeMessage, setPeriodModeMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [telegramReminderSettings, setTelegramReminderSettings] = useState<TelegramReminderSettings>(
    DEFAULT_TELEGRAM_REMINDER_SETTINGS
  );
  const [isLoadingTelegramReminders, setIsLoadingTelegramReminders] = useState(true);
  const [isSavingTelegramReminders, setIsSavingTelegramReminders] = useState(false);
  const [isTestingTelegramReminders, setIsTestingTelegramReminders] = useState(false);
  const [telegramReminderStatus, setTelegramReminderStatus] = useState<{
    botConfigured: boolean;
    allowedChatsConfigured: boolean;
    reminderSecretConfigured: boolean;
  }>({
    botConfigured: false,
    allowedChatsConfigured: false,
    reminderSecretConfigured: false,
  });
  const [telegramReminderMessage, setTelegramReminderMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    // Check if API key exists
    fetch('/api/settings/api-key')
      .then(res => res.json())
      .then(data => {
        setHasExistingKey(data.hasKey);
        if (data.maskedKey) {
          setApiKey(data.maskedKey);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/settings/period-mode')
      .then((res) => res.json())
      .then((data) => {
        if (data.periodMode === 'billing' || data.periodMode === 'calendar') {
          setPeriodMode(data.periodMode);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingPeriodMode(false));
  }, []);

  useEffect(() => {
    fetch('/api/settings/telegram-reminders')
      .then((res) => res.json())
      .then((data) => {
        if (data.settings) {
          setTelegramReminderSettings({
            ...DEFAULT_TELEGRAM_REMINDER_SETTINGS,
            ...data.settings,
          });
        }

        setTelegramReminderStatus({
          botConfigured: Boolean(data.botConfigured),
          allowedChatsConfigured: Boolean(data.allowedChatsConfigured),
          reminderSecretConfigured: Boolean(data.reminderSecretConfigured),
        });
      })
      .catch(() => {})
      .finally(() => setIsLoadingTelegramReminders(false));
  }, []);

  const handleSave = async () => {
    if (!apiKey || apiKey.includes('•')) {
      setMessage({ type: 'error', text: 'יש להזין מפתח API תקין' });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/settings/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });

      if (!response.ok) {
        throw new Error('Failed to save');
      }

      const data = await response.json();
      setHasExistingKey(true);
      setApiKey(data.maskedKey);
      setShowKey(false);
      setMessage({ type: 'success', text: 'המפתח נשמר בהצלחה!' });
    } catch {
      setMessage({ type: 'error', text: 'שגיאה בשמירת המפתח' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את מפתח ה-API?')) {
      return;
    }

    setIsSaving(true);
    try {
      await fetch('/api/settings/api-key', { method: 'DELETE' });
      setApiKey('');
      setHasExistingKey(false);
      setMessage({ type: 'success', text: 'המפתח נמחק' });
    } catch {
      setMessage({ type: 'error', text: 'שגיאה במחיקת המפתח' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePeriodMode = async () => {
    setIsSavingPeriodMode(true);
    setPeriodModeMessage(null);

    try {
      const response = await fetch('/api/settings/period-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodMode }),
      });

      if (!response.ok) throw new Error('Failed to save');
      setPeriodModeMessage({ type: 'success', text: 'סוג התקופה נשמר בהצלחה!' });
      router.refresh();
    } catch {
      setPeriodModeMessage({ type: 'error', text: 'שגיאה בשמירת סוג התקופה' });
    } finally {
      setIsSavingPeriodMode(false);
    }
  };

  const handleSaveTelegramReminders = async () => {
    setIsSavingTelegramReminders(true);
    setTelegramReminderMessage(null);

    try {
      const response = await fetch('/api/settings/telegram-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(telegramReminderSettings),
      });

      if (!response.ok) {
        throw new Error('Failed to save telegram reminders');
      }

      const data = await response.json();
      setTelegramReminderSettings({
        ...DEFAULT_TELEGRAM_REMINDER_SETTINGS,
        ...data.settings,
      });
      setTelegramReminderMessage({ type: 'success', text: 'הגדרות התזכורת נשמרו' });
      router.refresh();
    } catch {
      setTelegramReminderMessage({ type: 'error', text: 'שגיאה בשמירת הגדרות התזכורת' });
    } finally {
      setIsSavingTelegramReminders(false);
    }
  };

  const handleSendTelegramReminderTest = async () => {
    setIsTestingTelegramReminders(true);
    setTelegramReminderMessage(null);

    try {
      const response = await fetch('/api/settings/telegram-reminders/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(telegramReminderSettings),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to send test');
      }

      setTelegramReminderMessage({
        type: 'success',
        text: `נשלחה תזכורת בדיקה ל-${data.result.recipientCount} צ'אטים מורשים`,
      });
    } catch {
      setTelegramReminderMessage({ type: 'error', text: 'שגיאה בשליחת תזכורת בדיקה' });
    } finally {
      setIsTestingTelegramReminders(false);
    }
  };

  const updateTelegramReminderSetting = <K extends keyof TelegramReminderSettings>(
    key: K,
    value: TelegramReminderSettings[K]
  ) => {
    setTelegramReminderSettings((current) => ({
      ...current,
      [key]: value,
    }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">הגדרות</h1>
        <p className="text-gray-600 mt-1">ניהול הגדרות המערכת</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-purple-100 rounded-lg">
            <Key className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">מפתח API של OpenAI</h2>
            <p className="text-sm text-gray-500">
              משמש לזיהוי אוטומטי חכם של עסקים באמצעות GPT-5-mini
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                מפתח API
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-proj-..."
                  className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 font-mono text-sm"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showKey ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                ניתן להשיג מפתח ב-{' '}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-600 hover:underline"
                >
                  platform.openai.com
                </a>
              </p>
            </div>

            {message && (
              <div className={`flex items-center gap-2 p-3 rounded-lg ${
                message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {message.type === 'success' ? (
                  <CheckCircle className="h-5 w-5" />
                ) : (
                  <AlertCircle className="h-5 w-5" />
                )}
                <span className="text-sm">{message.text}</span>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={isSaving || !apiKey}
                className={`
                  flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium
                  transition-colors
                  ${isSaving || !apiKey
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                  }
                `}
              >
                {isSaving ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Save className="h-5 w-5" />
                )}
                שמור מפתח
              </button>

              {hasExistingKey && (
                <button
                  onClick={handleDelete}
                  disabled={isSaving}
                  className="px-4 py-3 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                >
                  מחק
                </button>
              )}
            </div>
          </div>
        )}

        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-medium text-blue-900 mb-2">מידע על אבטחה</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• המפתח נשמר בצורה מוצפנת בשרת</li>
            <li>• המפתח לא נשלח לשום צד שלישי מלבד OpenAI</li>
            <li>• ניתן למחוק את המפתח בכל עת</li>
          </ul>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-blue-100 rounded-lg">
            <span className="text-xl">📅</span>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">סוג תקופה חודשי</h2>
            <p className="text-sm text-gray-500">
              בחירה זו משפיעה על כל המסכים שמחשבים נתונים חודשיים
            </p>
          </div>
        </div>

        {isLoadingPeriodMode ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPeriodMode('calendar')}
                className={`border rounded-lg px-4 py-3 text-right transition-colors ${
                  periodMode === 'calendar'
                    ? 'border-blue-500 bg-blue-50 text-blue-800'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                }`}
              >
                <p className="font-medium">חודש קלנדרי (1-1)</p>
                <p className="text-xs mt-1 text-gray-500">חישוב לפי תחילת/סוף חודש רגיל</p>
              </button>

              <button
                type="button"
                onClick={() => setPeriodMode('billing')}
                className={`border rounded-lg px-4 py-3 text-right transition-colors ${
                  periodMode === 'billing'
                    ? 'border-blue-500 bg-blue-50 text-blue-800'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                }`}
              >
                <p className="font-medium">מחזור חיוב (10-10)</p>
                <p className="text-xs mt-1 text-gray-500">חישוב מ-10 עד 9 בחודש הבא</p>
              </button>
            </div>

            {periodModeMessage && (
              <div className={`flex items-center gap-2 p-3 rounded-lg ${
                periodModeMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {periodModeMessage.type === 'success' ? (
                  <CheckCircle className="h-5 w-5" />
                ) : (
                  <AlertCircle className="h-5 w-5" />
                )}
                <span className="text-sm">{periodModeMessage.text}</span>
              </div>
            )}

            <button
              onClick={handleSavePeriodMode}
              disabled={isSavingPeriodMode}
              className={`
                w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium
                transition-colors
                ${isSavingPeriodMode
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
                }
              `}
            >
              {isSavingPeriodMode ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Save className="h-5 w-5" />
              )}
              שמור סוג תקופה
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-sky-100 rounded-lg">
            <BellRing className="h-6 w-6 text-sky-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">תזכורות טלגרם</h2>
            <p className="text-sm text-gray-500">
              תזכורת שבועית חכמה אם חסר דאטה, לא הייתה העלאה או נשארו תנועות לא משויכות
            </p>
          </div>
        </div>

        {isLoadingTelegramReminders ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-4">
            <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-4">
              <input
                type="checkbox"
                checked={telegramReminderSettings.enabled}
                onChange={(event) => updateTelegramReminderSetting('enabled', event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
              />
              <div>
                <p className="font-medium text-gray-900">הפעל תזכורת שבועית</p>
                <p className="text-sm text-gray-500 mt-1">
                  התזכורת נשלחת בטלגרם רק אם אחד התנאים שסימנת מתקיים
                </p>
              </div>
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-gray-700">יום תזכורת</span>
                <select
                  value={telegramReminderSettings.dayOfWeek}
                  onChange={(event) => updateTelegramReminderSetting('dayOfWeek', Number(event.target.value))}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  {REMINDER_WEEKDAY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-gray-700">שעה</span>
                <select
                  value={telegramReminderSettings.hour}
                  onChange={(event) => updateTelegramReminderSetting('hour', Number(event.target.value))}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  {Array.from({ length: 24 }, (_, hour) => (
                    <option key={hour} value={hour}>
                      {formatReminderHour(hour)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="space-y-3 rounded-lg border border-gray-200 p-4">
              <p className="text-sm font-medium text-gray-700">תנאים לשליחת תזכורת</p>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={telegramReminderSettings.onlyIfNoUploadsInLast7Days}
                  onChange={(event) => updateTelegramReminderSetting('onlyIfNoUploadsInLast7Days', event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                />
                <div>
                  <p className="text-sm font-medium text-gray-800">לא הייתה העלאה ב-7 הימים האחרונים</p>
                  <p className="text-xs text-gray-500">מונע מצב שבו הדאטה לחודש הנוכחי נשאר ישן</p>
                </div>
              </label>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={telegramReminderSettings.onlyIfMissingCurrentPeriodSources}
                  onChange={(event) => updateTelegramReminderSetting('onlyIfMissingCurrentPeriodSources', event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                />
                <div>
                  <p className="text-sm font-medium text-gray-800">חסרים מקורות בתקופה הנוכחית</p>
                  <p className="text-xs text-gray-500">למשל יש עו&quot;ש אבל עוד לא עלה אשראי, או להפך</p>
                </div>
              </label>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={telegramReminderSettings.onlyIfUncategorizedTransactions}
                  onChange={(event) => updateTelegramReminderSetting('onlyIfUncategorizedTransactions', event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                />
                <div>
                  <p className="text-sm font-medium text-gray-800">יש תנועות לא משויכות</p>
                  <p className="text-xs text-gray-500">התזכורת תכלול קישור ישיר למסך הלא מסווגות</p>
                </div>
              </label>
            </div>

            <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-medium text-slate-900 mb-2">סטטוס תשתית</p>
              <ul className="space-y-1">
                <li>{telegramReminderStatus.botConfigured ? '✓' : '✗'} בוט טלגרם מוגדר</li>
                <li>{telegramReminderStatus.allowedChatsConfigured ? '✓' : '✗'} צ&apos;אטים מורשים הוגדרו</li>
                <li>{telegramReminderStatus.reminderSecretConfigured ? '✓' : '✗'} סוד להרצת cron הוגדר</li>
              </ul>
            </div>

            {telegramReminderMessage && (
              <div className={`flex items-center gap-2 p-3 rounded-lg ${
                telegramReminderMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {telegramReminderMessage.type === 'success' ? (
                  <CheckCircle className="h-5 w-5" />
                ) : (
                  <AlertCircle className="h-5 w-5" />
                )}
                <span className="text-sm">{telegramReminderMessage.text}</span>
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={handleSaveTelegramReminders}
                disabled={isSavingTelegramReminders}
                className={`
                  flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors
                  ${isSavingTelegramReminders
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-sky-600 text-white hover:bg-sky-700'
                  }
                `}
              >
                {isSavingTelegramReminders ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Save className="h-5 w-5" />
                )}
                שמור תזכורות
              </button>

              <button
                onClick={handleSendTelegramReminderTest}
                disabled={isTestingTelegramReminders}
                className={`
                  flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors
                  ${isTestingTelegramReminders
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'border border-sky-300 text-sky-700 hover:bg-sky-50'
                  }
                `}
              >
                {isTestingTelegramReminders ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
                שלח בדיקה עכשיו
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
