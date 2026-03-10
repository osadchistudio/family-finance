import { PdfParseResult, PdfTransaction } from './pdfTypes';
import { extractPdfPages } from './pdfText';

type Section = 'foreign' | 'domestic' | null;

export class IsracardPdfParser {
  private static TRANSACTION_DATE_RE = /^\d{2}\/\d{2}\/\d{2}/;
  private static AMOUNT_RE = /\d{1,3}(?:,\d{3})*\.\d{2}/g;
  private static DOMESTIC_PREFIXES = [
    'תש.נייד',
    'לאהוצג',
    'ה.קבע',
    'ש.אלחוט',
    'רכבתישראל-',
  ];
  private static DOMESTIC_CATEGORY_SUFFIXES = [
    'מסעדות/קפה',
    'מכולת/סופר',
    'פנאי/ספורט',
    "תש'רשויות",
    'שירותירכב',
    'שרותרפואי',
    'ספרים/דיסק',
    'מעדניות',
    'תקשורת',
    'מחשבים',
    'הלבשה',
    'תחבורה',
    'פארמה',
    'ביטוח',
    'שונות',
    'כליבית',
    'רהיטים',
    'דלק',
  ];

  async parse(buffer: Buffer, pages?: string[]): Promise<PdfParseResult> {
    const resolvedPages = pages ?? await extractPdfPages(buffer);
    const fullText = resolvedPages.join('\n');

    if (!this.isIsracard(fullText)) {
      throw new Error('הקובץ אינו פירוט חיובים של ישראכרט');
    }

    return {
      institution: 'ISRACARD',
      cardNumber: this.extractCardNumber(fullText),
      accountNumber: this.extractBillingAccount(fullText),
      accountName: 'ישראכרט',
      transactions: this.parseTransactions(resolvedPages),
    };
  }

  isIsracard(text: string): boolean {
    const lowerText = text.toLowerCase();
    return (
      lowerText.includes('ישראכרט') &&
      (lowerText.includes('פרוטפעולותיךלתאריך') || lowerText.includes('עסקותשחויבו/זוכו-בארץ'))
    );
  }

  private extractCardNumber(text: string): string | undefined {
    return text.match(/כרטיסשמסתייםבספרות:(\d{4})/)?.[1];
  }

  private extractBillingAccount(text: string): string | undefined {
    return text.match(/מספרחשבוןלחיובבמטבעישראלי:([\d-]+)/)?.[1];
  }

  private parseTransactions(pages: string[]): PdfTransaction[] {
    const transactions: PdfTransaction[] = [];
    const seen = new Set<string>();
    let currentSection: Section = null;

    for (const page of pages) {
      const lines = page
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];

        if (line.includes('רכישותבחו"ל')) {
          currentSection = 'foreign';
          continue;
        }

        if (line.includes('עסקותשחויבו/זוכו-בארץ')) {
          currentSection = 'domestic';
          continue;
        }

        if (!currentSection) {
          continue;
        }

        if (currentSection === 'domestic' && this.isDomesticTotalLine(line)) {
          currentSection = null;
          continue;
        }

        if (!IsracardPdfParser.TRANSACTION_DATE_RE.test(line)) {
          continue;
        }

        const { chunkLines, nextIndex } = this.collectChunk(lines, index, currentSection);
        index = nextIndex;

        const transaction = currentSection === 'foreign'
          ? this.parseForeignChunk(chunkLines)
          : this.parseDomesticChunk(chunkLines);

        if (!transaction) {
          continue;
        }

        const key = [
          transaction.date,
          transaction.description,
          transaction.amount,
          transaction.reference ?? '',
        ].join('|');

        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        transactions.push(transaction);
      }
    }

    return transactions;
  }

  private collectChunk(lines: string[], startIndex: number, section: Exclude<Section, null>) {
    const chunkLines = [lines[startIndex]];
    let cursor = startIndex + 1;

    for (; cursor < lines.length; cursor++) {
      const line = lines[cursor];

      if (line.includes('רכישותבחו"ל') || line.includes('עסקותשחויבו/זוכו-בארץ')) {
        break;
      }

      if (IsracardPdfParser.TRANSACTION_DATE_RE.test(line)) {
        break;
      }

      if (section === 'domestic' && this.isDomesticTotalLine(line)) {
        break;
      }

      if (this.shouldIgnoreContinuationLine(line, section)) {
        continue;
      }

      chunkLines.push(line);
    }

    return {
      chunkLines,
      nextIndex: cursor - 1,
    };
  }

  private shouldIgnoreContinuationLine(line: string, section: Exclude<Section, null>): boolean {
    if (line.startsWith('**פ.עמלה')) {
      return true;
    }

    if (line.startsWith('סה"כחיובלתאריך')) {
      return true;
    }

    if (section === 'foreign') {
      return line.includes('סכוםהחיוב') || line.includes('סכוםעמלה');
    }

    if (
      line.startsWith('*') ||
      line.startsWith('מספר חשבון:') ||
      /^עמוד\d+מתוך\d+$/.test(line) ||
      line.includes('TOP-CASH') ||
      line.includes('הקודהסודי')
    ) {
      return true;
    }

    return [
      'תאריך',
      'עסקה',
      'כרטיס',
      'בעסקה',
      'שםביתעסקענףסכום',
      'סכום',
      'החיוב',
      'בש"ח',
      'פירוטנוסף',
    ].includes(line);
  }

  private isDomesticTotalLine(line: string): boolean {
    return line.startsWith('סה"כחיובלתאריך');
  }

  private parseForeignChunk(chunkLines: string[]): PdfTransaction | null {
    const [firstLine, ...otherLines] = chunkLines;
    const startMatch = firstLine.match(/^(\d{2}\/\d{2}\/\d{2})(?:[^\s\d])?(.+)$/);

    if (!startMatch) {
      return null;
    }

    const amountLine = otherLines.find(line => this.lineContainsAmount(line));
    if (!amountLine) {
      return null;
    }

    const billedAmount = this.extractLastAmount(amountLine);
    if (billedAmount === null) {
      return null;
    }

    const originalCurrencyMatch = amountLine.match(/^([$€£])\s?(\d{1,3}(?:,\d{3})*\.\d{2})/);

    return {
      date: startMatch[1],
      valueDate: amountLine.match(/(\d{2}\/\d{2}\/\d{2})/)?.[1],
      description: startMatch[2].trim(),
      amount: -billedAmount,
      debit: billedAmount,
      credit: null,
      originalAmount: originalCurrencyMatch ? this.toNumber(originalCurrencyMatch[2]) : undefined,
      originalCurrency: originalCurrencyMatch ? this.currencyFromSymbol(originalCurrencyMatch[1]) : undefined,
      reference: otherLines.find(line => /^\d+$/.test(line)),
    };
  }

  private parseDomesticChunk(chunkLines: string[]): PdfTransaction | null {
    const chunk = chunkLines.join('');
    const dateMatch = chunk.match(/^(\d{2}\/\d{2}\/\d{2})/);

    if (!dateMatch) {
      return null;
    }

    const amountMatches = [...chunk.matchAll(IsracardPdfParser.AMOUNT_RE)];
    if (amountMatches.length === 0) {
      return null;
    }

    const billedMatch = amountMatches[amountMatches.length - 1];
    const originalMatch = amountMatches.length > 1 ? amountMatches[amountMatches.length - 2] : billedMatch;

    const rawBody = chunk.slice(dateMatch[0].length, originalMatch.index).trim();
    const extra = chunk.slice((billedMatch.index ?? chunk.length) + billedMatch[0].length).trim();
    const billedAmount = this.toNumber(billedMatch[0]);
    const originalAmount = this.toNumber(originalMatch[0]);
    const isCredit = rawBody.includes('זיכוי');

    let description = this.stripCategorySuffix(rawBody);
    description = this.stripPaymentPrefix(description);
    description = description.replace(/-?זיכוי/g, '').trim();

    if (!description) {
      description = rawBody.replace(/-?זיכוי/g, '').trim();
    }

    const formattedExtra = this.formatDomesticExtra(extra);
    if (formattedExtra) {
      description = `${description} ${formattedExtra}`.trim();
    }

    return {
      date: dateMatch[1],
      description,
      amount: isCredit ? billedAmount : -billedAmount,
      debit: isCredit ? null : billedAmount,
      credit: isCredit ? billedAmount : null,
      originalAmount: originalAmount !== billedAmount ? originalAmount : undefined,
      originalCurrency: originalAmount !== billedAmount ? 'ILS' : undefined,
      reference: formattedExtra || undefined,
    };
  }

  private stripPaymentPrefix(value: string): string {
    let cleaned = value;

    for (const prefix of IsracardPdfParser.DOMESTIC_PREFIXES) {
      if (cleaned.startsWith(prefix)) {
        cleaned = cleaned.slice(prefix.length);
        break;
      }
    }

    return cleaned.trim();
  }

  private stripCategorySuffix(value: string): string {
    const suffix = [...IsracardPdfParser.DOMESTIC_CATEGORY_SUFFIXES]
      .sort((left, right) => right.length - left.length)
      .find(category => value.endsWith(category));

    return suffix ? value.slice(0, -suffix.length).trim() : value.trim();
  }

  private formatDomesticExtra(value: string): string {
    if (!value) {
      return '';
    }

    const installments = value.match(/^תשלום(\d+)מתוך(\d+)$/);
    if (installments) {
      return `תשלום ${installments[1]} מתוך ${installments[2]}`;
    }

    const recipient = value.match(/^ל:(.+)$/);
    if (recipient) {
      return `ל:${recipient[1]}`;
    }

    return value;
  }

  private lineContainsAmount(line: string): boolean {
    return /\d{1,3}(?:,\d{3})*\.\d{2}/.test(line);
  }

  private extractLastAmount(line: string): number | null {
    const matches = [...line.matchAll(IsracardPdfParser.AMOUNT_RE)];
    if (matches.length === 0) {
      return null;
    }

    return this.toNumber(matches[matches.length - 1][0]);
  }

  private toNumber(value: string): number {
    return Number.parseFloat(value.replace(/,/g, ''));
  }

  private currencyFromSymbol(symbol: string): string | undefined {
    switch (symbol) {
      case '$':
        return 'USD';
      case '€':
        return 'EUR';
      case '£':
        return 'GBP';
      default:
        return undefined;
    }
  }
}
