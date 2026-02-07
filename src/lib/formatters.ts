import dayjs from 'dayjs';

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

export function formatDate(date: Date | string): string {
  return dayjs(date).format('DD/MM/YYYY');
}

export function formatDateShort(date: Date | string): string {
  return dayjs(date).format('DD/MM');
}

export function parseHebrewDate(dateStr: string): Date | null {
  // Try DD/MM/YYYY format
  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }
  return null;
}

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
];

export function getHebrewMonthName(monthIndex: number): string {
  return HEBREW_MONTHS[monthIndex] || '';
}

export function getHebrewMonthYear(date: Date | string): string {
  const d = dayjs(date);
  return `${HEBREW_MONTHS[d.month()]} ${d.year()}`;
}

export function parseAmount(value: string | number): number {
  if (typeof value === 'number') return value;
  // Handle Hebrew number formats: 1,234.56 or -1,234.56 or (1,234.56)
  let cleaned = value.toString().trim();

  // Handle parentheses as negative
  const isNegative = cleaned.startsWith('(') && cleaned.endsWith(')') || cleaned.startsWith('-');
  cleaned = cleaned.replace(/[()₪\s]/g, '');

  // Remove thousand separators and handle decimal
  cleaned = cleaned.replace(/,/g, '');

  const num = parseFloat(cleaned) || 0;
  return isNegative && num > 0 ? -num : num;
}
