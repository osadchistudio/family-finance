import { extractText } from 'unpdf';

export interface PdfTransaction {
  date: string;
  description: string;
  debit: number | null;
  credit: number | null;
  amount: number;
}

export interface PdfParseResult {
  institution: 'BANK_HAPOALIM';
  accountNumber: string;
  accountName: string;
  transactions: PdfTransaction[];
}

export class BankHapoalimPdfParser {
  /**
   * Parse Bank Hapoalim PDF statement
   */
  async parse(buffer: Buffer): Promise<PdfParseResult> {
    // Extract text from PDF using unpdf - requires Uint8Array
    const uint8Array = new Uint8Array(buffer);
    const { text: pages } = await extractText(uint8Array);
    // Join all pages into a single string
    const fullText = Array.isArray(pages) ? pages.join('\n') : pages;

    // Verify this is a Bank Hapoalim document
    if (!this.isBankHapoalim(fullText)) {
      throw new Error('הקובץ אינו דף חשבון של בנק הפועלים');
    }

    // Extract account info
    const accountNumber = this.extractAccountNumber(fullText);
    const accountName = this.extractAccountName(fullText);

    // Parse transactions
    const transactions = this.parseTransactions(fullText);

    return {
      institution: 'BANK_HAPOALIM',
      accountNumber,
      accountName,
      transactions,
    };
  }

  /**
   * Check if this is a Bank Hapoalim document
   */
  isBankHapoalim(text: string): boolean {
    const markers = ['בנק הפועלים', 'bankhapoalim', 'תנועות בחשבון'];
    return markers.some(marker => text.toLowerCase().includes(marker.toLowerCase()));
  }

  /**
   * Extract account number from text
   */
  private extractAccountNumber(text: string): string {
    const match = text.match(/(\d{6})\s*\d{3}\s*12/);
    if (match) {
      return match[1];
    }
    return 'unknown';
  }

  /**
   * Extract account holder name
   */
  private extractAccountName(text: string): string {
    const match = text.match(/שם חשבון\s*([\u0590-\u05FF\s']+?)(?:תנועות|$)/);
    if (match) {
      return match[1].trim().split('\n')[0].trim();
    }
    return 'בנק הפועלים';
  }

  /**
   * Parse all transactions from the PDF text
   */
  private parseTransactions(text: string): PdfTransaction[] {
    const transactions: PdfTransaction[] = [];
    const seen = new Set<string>();

    // Bank Hapoalim PDF format (no spaces between fields):
    // 04/02/2026מסטרקרד262.27₪32,422.86##\n2
    // Date immediately followed by Hebrew description, then amount with ₪, then balance, then ##, then 1 or 2 on next line

    // Pattern: date + Hebrew description + amount₪ + balance + ## + newline + 1 or 2
    const txPattern = /(\d{2}\/\d{2}\/\d{4})([\u0590-\u05FFa-zA-Z\s\-'".,\d]+?)([\d,]+\.\d{2})₪([-\d,]+\.\d{2})##\s*\n?\s*([12])/g;

    let match;
    while ((match = txPattern.exec(text)) !== null) {
      const date = match[1];
      let description = match[2].trim();
      const amountStr = match[3];
      // match[4] is balance, we don't need it
      const creditDebitIndicator = match[5]; // 1 = credit, 2 = debit

      // Skip headers and summary rows
      if (description === 'פעולה' ||
          description.includes('חובה') ||
          description.includes('זכות') ||
          description.includes('תאריך') ||
          description.includes('יתרה') ||
          description.includes('סה"כ')) {
        continue;
      }

      const amountValue = this.parseAmount(amountStr);
      if (amountValue === 0) continue;

      const isCredit = creditDebitIndicator === '1';

      let debit: number | null = null;
      let credit: number | null = null;
      let amount: number;

      if (isCredit) {
        credit = amountValue;
        amount = amountValue;
      } else {
        debit = amountValue;
        amount = -amountValue;
      }

      const key = `${date}-${description}-${amountValue}`;
      if (seen.has(key)) continue;
      seen.add(key);

      transactions.push({ date, description, debit, credit, amount });
    }

    return transactions;
  }

  /**
   * Parse amount string to number
   */
  private parseAmount(amountStr: string): number {
    if (!amountStr) return 0;
    const cleaned = amountStr.replace(/,/g, '').replace(/₪/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
}
