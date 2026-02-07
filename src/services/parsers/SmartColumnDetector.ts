/**
 * Smart Column Detector
 * Automatically detects column types by analyzing headers and content
 */

export interface DetectedColumns {
  date?: string;
  description?: string;
  amount?: string;
  debit?: string;
  credit?: string;
  balance?: string;
  valueDate?: string;
  reference?: string;
  originalAmount?: string;
  currency?: string;
}

// Keywords that indicate each column type (Hebrew + English)
const COLUMN_PATTERNS: Record<keyof DetectedColumns, RegExp[]> = {
  date: [
    /תאריך\s*עסק/i,
    /תאריך\s*הפעולה/i,
    /תאריך\s*רכישה/i,
    /^תאריך$/i,
    /date/i,
    /transaction\s*date/i
  ],
  description: [
    /שם\s*בית\s*(ה)?עסק/i,
    /בית\s*עסק/i,
    /תי?אור/i,
    /פרטי?\s*(ה)?עסק/i,
    /פרטי?\s*(ה)?פעולה/i,
    /שם\s*העסק/i,
    /description/i,
    /merchant/i,
    /details/i
  ],
  amount: [
    /סכום\s*חיוב/i,
    /סכום\s*לחיוב/i,
    /סכום\s*בש/i,
    /סכום\s*₪/i,
    /^סכום$/i,
    /סה.*כ/i,
    /amount/i,
    /charge/i
  ],
  debit: [
    /חובה/i,
    /debit/i,
    /משיכה/i
  ],
  credit: [
    /זכות/i,
    /credit/i,
    /הפקדה/i
  ],
  balance: [
    /יתרה/i,
    /balance/i
  ],
  valueDate: [
    /תאריך\s*חיוב/i,
    /מועד\s*חיוב/i,
    /תאריך\s*ערך/i,
    /value\s*date/i
  ],
  reference: [
    /אסמכת/i,
    /reference/i,
    /מספר\s*שובר/i,
    /אישור/i
  ],
  originalAmount: [
    /סכום\s*עסק/i,
    /סכום\s*מקור/i,
    /original/i
  ],
  currency: [
    /מטבע/i,
    /currency/i
  ]
};

// Date patterns to detect if a cell contains a date
const DATE_PATTERNS = [
  /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/,  // DD.MM.YY or DD/MM/YYYY
  /^\d{4}[./-]\d{1,2}[./-]\d{1,2}$/,    // YYYY-MM-DD
];

// Amount patterns to detect if a cell contains an amount
const AMOUNT_PATTERNS = [
  /^-?[\d,]+\.?\d*$/,                    // 1234.56 or -1,234.56
  /^-?₪?\s*[\d,]+\.?\d*$/,              // ₪1234.56
  /^-?[\d,]+\.?\d*\s*₪?$/,              // 1234.56₪
];

export class SmartColumnDetector {
  /**
   * Detect column types from headers and sample data
   */
  detectColumns(headers: string[], sampleRows: Record<string, unknown>[]): DetectedColumns {
    const detected: DetectedColumns = {};
    const usedColumns = new Set<string>();

    // First pass: match by header names
    for (const header of headers) {
      const cleanHeader = header.trim();
      if (!cleanHeader) continue;

      for (const [colType, patterns] of Object.entries(COLUMN_PATTERNS)) {
        if (detected[colType as keyof DetectedColumns]) continue; // Already found

        for (const pattern of patterns) {
          if (pattern.test(cleanHeader)) {
            detected[colType as keyof DetectedColumns] = cleanHeader;
            usedColumns.add(cleanHeader);
            break;
          }
        }
      }
    }

    // Second pass: analyze content for undetected columns
    if (!detected.date || !detected.amount) {
      for (const header of headers) {
        if (usedColumns.has(header)) continue;

        const values = sampleRows
          .map(row => row[header])
          .filter(v => v != null && String(v).trim() !== '')
          .map(v => String(v).trim());

        if (values.length === 0) continue;

        // Check if column contains dates
        if (!detected.date) {
          const dateMatches = values.filter(v =>
            DATE_PATTERNS.some(p => p.test(v))
          );
          if (dateMatches.length >= values.length * 0.5) {
            detected.date = header;
            usedColumns.add(header);
            continue;
          }
        }

        // Check if column contains amounts
        if (!detected.amount && !detected.debit && !detected.credit) {
          const amountMatches = values.filter(v =>
            AMOUNT_PATTERNS.some(p => p.test(v.replace(/,/g, '')))
          );
          if (amountMatches.length >= values.length * 0.5) {
            // Check if mostly negative (expenses) or mixed
            const hasNegatives = values.some(v => v.includes('-'));
            if (hasNegatives) {
              detected.amount = header;
            } else {
              // Could be debit/credit split - leave for now
              detected.amount = header;
            }
            usedColumns.add(header);
            continue;
          }
        }

        // Check if column contains descriptions (long text)
        if (!detected.description) {
          const avgLength = values.reduce((sum, v) => sum + v.length, 0) / values.length;
          const hasHebrew = values.some(v => /[\u0590-\u05FF]/.test(v));
          if (avgLength > 5 && hasHebrew) {
            detected.description = header;
            usedColumns.add(header);
            continue;
          }
        }
      }
    }

    return detected;
  }

  /**
   * Check if we have minimum required columns
   */
  hasRequiredColumns(detected: DetectedColumns): boolean {
    const hasDate = !!detected.date;
    const hasDescription = !!detected.description;
    const hasAmount = !!detected.amount || (!!detected.debit && !!detected.credit);

    return hasDate && hasDescription && hasAmount;
  }

  /**
   * Get missing columns for error message
   */
  getMissingColumns(detected: DetectedColumns): string[] {
    const missing: string[] = [];

    if (!detected.date) missing.push('תאריך');
    if (!detected.description) missing.push('תיאור/שם בית עסק');
    if (!detected.amount && !detected.debit) missing.push('סכום');

    return missing;
  }
}

export const smartColumnDetector = new SmartColumnDetector();
