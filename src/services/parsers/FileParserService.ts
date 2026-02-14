import * as XLSX from 'xlsx';
import { parse as csvParse } from 'csv-parse/sync';
import iconv from 'iconv-lite';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { Institution } from '@prisma/client';
import { ParsedTransaction, ParseResult, ParserConfig } from './types';
import { PARSER_CONFIGS, INSTITUTION_MARKERS } from './configs';
import { smartColumnDetector, DetectedColumns } from './SmartColumnDetector';
import { parseAmount } from '@/lib/formatters';
import { BankHapoalimPdfParser } from './BankHapoalimPdfParser';

dayjs.extend(customParseFormat);

export class FileParserService {
  private static CARD_BILL_KEYWORDS = [
    'מסטרקרד',
    'מסטרקארד',
    'מאסטרקארד',
    'mastercard',
    'ישראכרט',
    'isracard',
    'לאומיקארד',
    'leumicard',
    'מקס',
    'max',
    'ויזהכאל',
    'visa',
    'amex',
    'כרטיסאשראי',
    'חיובכרטיס',
  ];

  /**
   * Auto-detect institution from file content
   */
  detectInstitution(buffer: Buffer, filename: string): Institution {
    // Try different encodings
    let content = '';
    try {
      content = iconv.decode(buffer, 'utf-8');
    } catch {
      content = iconv.decode(buffer, 'windows-1255');
    }

    const lowerContent = content.toLowerCase();

    for (const [institution, markers] of Object.entries(INSTITUTION_MARKERS)) {
      if (markers.some((marker) => lowerContent.includes(marker.toLowerCase()))) {
        return institution as Institution;
      }
    }

    return 'OTHER';
  }

  /**
   * Extract card number (last 4 digits) from file content
   */
  extractCardNumber(buffer: Buffer, encoding: string): string | undefined {
    // Try text-based extraction first (CSV files)
    let content: string;
    try {
      content = iconv.decode(buffer, encoding);
    } catch {
      content = buffer.toString('utf-8');
    }

    const patterns = [
      /כרטיס.*?(\d{4})\s*$/m,
      /4 ספרות.*?(\d{4})/,
      /מספר כרטיס.*?(\d{4})/,
      /card.*?(\d{4})/i,
      /\*{4,}(\d{4})/,
      /xxxx.*?(\d{4})/i,
      /[-–]\s*(\d{4})(?:\s|$)/m,  // "מסטרקארד - 0222" format
      /(\d{4})\s*$/m,  // 4 digits at end of line
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return undefined;
  }

  /**
   * Extract card number from Excel file by reading cell values
   */
  extractCardNumberFromExcel(buffer: Buffer): string | undefined {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');

      // Search first 10 rows for card number patterns
      for (let r = range.s.r; r <= Math.min(range.e.r, 10); r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cellAddress = XLSX.utils.encode_cell({ r, c });
          const cell = sheet[cellAddress];
          if (cell && cell.v != null) {
            const cellValue = String(cell.v).trim();

            // Patterns: "מסטרקארד - 0222", "גולד - מסטרקארד - 5595", "כרטיס 1234"
            const patterns = [
              /[-–]\s*(\d{4})(?:\s*$)/,
              /כרטיס.*?(\d{4})/,
              /card.*?(\d{4})/i,
              /\*{4,}(\d{4})/,
            ];

            for (const pattern of patterns) {
              const match = cellValue.match(pattern);
              if (match && match[1]) {
                return match[1];
              }
            }
          }
        }
      }
    } catch {
      // Ignore Excel parse errors
    }

    return undefined;
  }

  /**
   * Main parsing entry point
   */
  async parseFile(
    buffer: Buffer,
    filename: string,
    institution?: Institution
  ): Promise<ParseResult> {
    // Check if this is a PDF file
    const isPdf = /\.pdf$/i.test(filename);
    if (isPdf) {
      return this.parsePdf(buffer, filename);
    }

    const detectedInstitution = institution || this.detectInstitution(buffer, filename);
    const config = PARSER_CONFIGS[detectedInstitution];
    const isExcel = /\.xlsx?$/i.test(filename);

    // Extract card number for credit cards
    let cardNumber: string | undefined;
    if (detectedInstitution === 'ISRACARD' || detectedInstitution === 'LEUMI_CARD') {
      if (isExcel) {
        cardNumber = this.extractCardNumberFromExcel(buffer);
      }
      if (!cardNumber) {
        cardNumber = this.extractCardNumber(buffer, config.encoding);
      }
    }

    let rows: Record<string, unknown>[];
    const errors: string[] = [];

    try {
      if (isExcel) {
        rows = this.parseExcel(buffer);
      } else {
        rows = this.parseCsv(buffer, config);
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Unknown parsing error';
      return {
        institution: detectedInstitution,
        cardNumber,
        transactions: [],
        rowCount: 0,
        successCount: 0,
        skippedRows: 0,
        errors: [errorMsg]
      };
    }

    if (rows.length === 0) {
      return {
        institution: detectedInstitution,
        cardNumber,
        transactions: [],
        rowCount: 0,
        successCount: 0,
        skippedRows: 0,
        errors: ['הקובץ ריק או לא ניתן לקריאה']
      };
    }

    // Smart column detection
    const headers = Object.keys(rows[0]);
    const sampleRows = rows.slice(0, 10);
    const detectedColumns = smartColumnDetector.detectColumns(headers, sampleRows);

    if (!smartColumnDetector.hasRequiredColumns(detectedColumns)) {
      const missing = smartColumnDetector.getMissingColumns(detectedColumns);
      return {
        institution: detectedInstitution,
        cardNumber,
        transactions: [],
        rowCount: rows.length,
        successCount: 0,
        skippedRows: rows.length,
        errors: [`לא נמצאו עמודות נדרשות: ${missing.join(', ')}`]
      };
    }

    // Parse transactions using detected columns
    const transactions: ParsedTransaction[] = [];
    const isCreditCard = detectedInstitution === 'ISRACARD' || detectedInstitution === 'LEUMI_CARD';
    let skippedRows = 0;

    for (let i = 0; i < rows.length; i++) {
      try {
        const tx = this.parseTransactionSmart(rows[i], detectedColumns, isCreditCard);
        if (tx) {
          transactions.push(tx);
        } else {
          skippedRows++;
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Unknown error';
        errors.push(`Row ${i + 1}: ${errorMsg}`);
      }
    }

    // Sanity check: warn if many rows were skipped unexpectedly
    const skipRatio = rows.length > 0 ? skippedRows / rows.length : 0;
    if (transactions.length > 0 && skipRatio > 0.5) {
      console.warn(
        `⚠️ Parser skipped ${skippedRows}/${rows.length} rows (${Math.round(skipRatio * 100)}%) ` +
        `for ${detectedInstitution}. Detected columns: ${JSON.stringify(detectedColumns)}`
      );
    }

    return {
      institution: detectedInstitution,
      cardNumber,
      transactions,
      rowCount: rows.length,
      successCount: transactions.length,
      skippedRows,
      errors
    };
  }

  private parseExcel(buffer: Buffer): Record<string, unknown>[] {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Try to find the header row (first row with multiple non-empty cells)
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    let headerRow = 0;

    for (let r = range.s.r; r <= Math.min(range.e.r, 10); r++) {
      let nonEmptyCells = 0;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cellAddress = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[cellAddress];
        if (cell && cell.v != null && String(cell.v).trim() !== '') {
          nonEmptyCells++;
        }
      }
      if (nonEmptyCells >= 3) {
        headerRow = r;
        break;
      }
    }

    const rows = XLSX.utils.sheet_to_json(sheet, {
      range: headerRow,
      defval: ''
    });

    return rows as Record<string, unknown>[];
  }

  private parseCsv(buffer: Buffer, config: ParserConfig): Record<string, unknown>[] {
    // Handle Hebrew encoding
    let content: string;
    try {
      content = iconv.decode(buffer, config.encoding);
    } catch {
      content = buffer.toString('utf-8');
    }

    // Remove BOM if present
    content = content.replace(/^\uFEFF/, '');

    // Find header row
    const lines = content.split(/\r?\n/);
    let headerRow = 0;

    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      const cells = lines[i].split(config.delimiter);
      const nonEmptyCells = cells.filter(c => c.trim() !== '').length;
      if (nonEmptyCells >= 3) {
        headerRow = i;
        break;
      }
    }

    const dataContent = lines.slice(headerRow).join('\n');

    const rows = csvParse(dataContent, {
      delimiter: config.delimiter,
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true
    }) as Record<string, unknown>[];

    return rows;
  }

  // Known summary/total row patterns that should be skipped even if they look like transactions
  private static SUMMARY_PATTERNS = [
    /^סה"?כ/,
    /^סה"כ/,
    /סה"?כ\s*(ל|ב)?חיוב/,
    /סה"כ\s*(ל|ב)?חיוב/,
    /^total/i,
    /^subtotal/i,
  ];

  private isSummaryRow(description: string): boolean {
    return FileParserService.SUMMARY_PATTERNS.some(p => p.test(description.trim()));
  }

  private isConsolidatedCardCharge(description: string, amount: number, isCreditCard: boolean): boolean {
    if (isCreditCard || amount >= 0) return false;

    const normalizedDescription = description
      .toLowerCase()
      .replace(/[^\u0590-\u05FFa-z]/g, '');

    return FileParserService.CARD_BILL_KEYWORDS.some(keyword => normalizedDescription.includes(keyword));
  }

  private parseTransactionSmart(
    row: Record<string, unknown>,
    columns: DetectedColumns,
    isCreditCard: boolean
  ): ParsedTransaction | null {
    // Extract date
    const dateStr = this.getValue(row, columns.date);
    if (!dateStr) return null;

    const date = this.parseDate(dateStr);
    if (!date.isValid()) return null;

    // Extract description early to check for summary rows
    const description = this.getValue(row, columns.description);
    if (!description) return null;

    // Skip summary/total rows
    if (this.isSummaryRow(description)) return null;

    // Extract amount
    let amount: number;
    // If both debit/credit columns exist, prefer them over a generic amount column.
    // This avoids sign ambiguity in files that expose חובה/זכות semantics explicitly.
    if (columns.debit && columns.credit) {
      const debit = Math.abs(parseAmount(this.getValue(row, columns.debit) || '0'));
      const credit = Math.abs(parseAmount(this.getValue(row, columns.credit) || '0'));
      amount = credit - debit;

      // Fallback for rows where debit/credit cells are empty but a generic amount exists.
      if (amount === 0 && columns.amount) {
        amount = parseAmount(this.getValue(row, columns.amount) || '0');
      }
    } else if (columns.amount) {
      amount = parseAmount(this.getValue(row, columns.amount));
    } else {
      return null;
    }

    // Credit card transactions should be negative expenses.
    // Refund/credit rows should be positive income in system.
    if (isCreditCard) {
      if (amount > 0) {
        amount = -amount;
      } else if (amount < 0) {
        amount = Math.abs(amount);
      }
    }

    if (amount === 0) return null;
    if (this.isConsolidatedCardCharge(description, amount, isCreditCard)) return null;

    // Build transaction
    const transaction: ParsedTransaction = {
      date: date.toDate(),
      description: description.trim(),
      amount
    };

    // Optional fields
    if (columns.valueDate) {
      const valueDateStr = this.getValue(row, columns.valueDate);
      if (valueDateStr) {
        const valueDate = this.parseDate(valueDateStr);
        if (valueDate.isValid()) {
          transaction.valueDate = valueDate.toDate();
        }
      }
    }

    if (columns.reference) {
      const ref = this.getValue(row, columns.reference);
      if (ref) transaction.reference = ref;
    }

    if (columns.originalAmount) {
      const origAmount = parseAmount(this.getValue(row, columns.originalAmount) || '0');
      if (origAmount !== 0) {
        transaction.originalAmount = Math.abs(origAmount);
      }
    }

    if (columns.currency) {
      const currency = this.getValue(row, columns.currency);
      if (currency && currency !== 'ILS' && currency !== 'ש"ח' && currency !== '₪') {
        transaction.originalCurrency = currency;
      }
    }

    return transaction;
  }

  private getValue(row: Record<string, unknown>, key: string | undefined): string {
    if (!key) return '';
    const value = row[key];
    return value != null ? String(value).trim() : '';
  }

  /**
   * Parse date with multiple format attempts
   */
  private parseDate(dateStr: string): dayjs.Dayjs {
    // Handle Excel serial dates
    if (/^\d+$/.test(dateStr)) {
      const serial = parseInt(dateStr);
      if (serial > 30000 && serial < 60000) {
        // Excel serial date
        const date = new Date((serial - 25569) * 86400 * 1000);
        return dayjs(date);
      }
    }

    // Try common date formats
    const formats = [
      'DD.MM.YY',
      'DD.MM.YYYY',
      'DD/MM/YY',
      'DD/MM/YYYY',
      'YYYY-MM-DD',
      'DD-MM-YYYY',
      'D.M.YY',
      'D.M.YYYY',
      'D/M/YY',
      'D/M/YYYY'
    ];

    for (const format of formats) {
      const date = dayjs(dateStr, format, true);
      if (date.isValid()) return date;
    }

    // Last resort - let dayjs try to parse it
    return dayjs(dateStr);
  }

  /**
   * Parse PDF file (currently supports Bank Hapoalim)
   */
  private async parsePdf(buffer: Buffer, filename: string): Promise<ParseResult> {
    const pdfParser = new BankHapoalimPdfParser();

    try {
      const result = await pdfParser.parse(buffer);

      // Convert PDF transactions to ParsedTransaction format
      const transactions: ParsedTransaction[] = result.transactions.map(tx => ({
        date: this.parseDate(tx.date).toDate(),
        description: tx.description,
        amount: tx.amount,
      }));

      return {
        institution: result.institution,
        cardNumber: result.accountNumber, // Use cardNumber field for account number
        transactions,
        rowCount: result.transactions.length,
        successCount: transactions.length,
        skippedRows: 0,
        errors: []
      };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'שגיאה בפענוח קובץ PDF';
      return {
        institution: 'BANK_HAPOALIM',
        transactions: [],
        rowCount: 0,
        successCount: 0,
        skippedRows: 0,
        errors: [errorMsg]
      };
    }
  }
}

export const fileParserService = new FileParserService();
