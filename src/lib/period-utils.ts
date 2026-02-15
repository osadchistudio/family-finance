import dayjs, { Dayjs } from 'dayjs';
import { getHebrewMonthName } from '@/lib/formatters';

export type PeriodMode = 'calendar' | 'billing';

export const PERIOD_MODE_SETTING_KEY = 'period_mode';
export const DEFAULT_PERIOD_MODE: PeriodMode = 'calendar';
const BILLING_CUTOFF_DAY = 10;

export interface PeriodDefinition {
  key: string;
  label: string;
  subLabel: string;
  chartLabel: string;
  startDate: Dayjs;
  endDate: Dayjs;
  isCurrent: boolean;
}

export function normalizePeriodMode(value?: string | null): PeriodMode {
  return value === 'billing' ? 'billing' : DEFAULT_PERIOD_MODE;
}

export function getCurrentBillingCycleStart(referenceDate: Dayjs) {
  const currentMonthCutoff = referenceDate.startOf('month').date(BILLING_CUTOFF_DAY);
  return referenceDate.date() >= BILLING_CUTOFF_DAY
    ? currentMonthCutoff
    : currentMonthCutoff.subtract(1, 'month');
}

export function getPeriodStart(date: Dayjs, mode: PeriodMode): Dayjs {
  if (mode === 'calendar') return date.startOf('month');

  return date.date() >= BILLING_CUTOFF_DAY
    ? date.startOf('month').date(BILLING_CUTOFF_DAY)
    : date.subtract(1, 'month').startOf('month').date(BILLING_CUTOFF_DAY);
}

export function getPeriodEnd(date: Dayjs, mode: PeriodMode): Dayjs {
  const start = getPeriodStart(date, mode);
  return mode === 'calendar' ? start.endOf('month') : start.add(1, 'month').subtract(1, 'day');
}

export function getPeriodKey(date: Dayjs, mode: PeriodMode): string {
  return getPeriodStart(date, mode).format('YYYY-MM');
}

export function buildPeriods(mode: PeriodMode, now: Dayjs, count: number): PeriodDefinition[] {
  const periods: PeriodDefinition[] = [];

  if (mode === 'calendar') {
    for (let i = count - 1; i >= 0; i--) {
      const startDate = now.subtract(i, 'month').startOf('month');
      const endDate = startDate.endOf('month');
      periods.push({
        key: startDate.format('YYYY-MM'),
        label: getHebrewMonthName(startDate.month()),
        subLabel: String(startDate.year()),
        chartLabel: getHebrewMonthName(startDate.month()),
        startDate,
        endDate,
        isCurrent: i === 0,
      });
    }
    return periods;
  }

  const currentCycleStart = getCurrentBillingCycleStart(now);
  for (let i = count - 1; i >= 0; i--) {
    const startDate = currentCycleStart.subtract(i, 'month');
    const endDate = startDate.add(1, 'month').subtract(1, 'day');
    periods.push({
      key: startDate.format('YYYY-MM'),
      label: getHebrewMonthName(startDate.month()),
      subLabel: `${startDate.format('DD/MM')} - ${endDate.format('DD/MM/YYYY')}`,
      chartLabel: getHebrewMonthName(startDate.month()),
      startDate,
      endDate,
      isCurrent: i === 0,
    });
  }

  return periods;
}

export function buildPeriodLabels(mode: PeriodMode) {
  return {
    short: mode === 'billing' ? 'מחזור חיוב (10-10)' : 'חודש קלנדרי (1-1)',
    analyticsSuffix: mode === 'billing' ? 'מחזורי חיוב' : 'חודשים',
  };
}

export function parseDate(input: Date | string) {
  return dayjs(input);
}
