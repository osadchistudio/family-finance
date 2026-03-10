import { Institution } from '@prisma/client';

export interface PdfTransaction {
  date: string;
  description: string;
  amount: number;
  debit?: number | null;
  credit?: number | null;
  valueDate?: string;
  originalAmount?: number;
  originalCurrency?: string;
  reference?: string;
}

export interface PdfParseResult {
  institution: Institution;
  accountNumber?: string;
  cardNumber?: string;
  accountName: string;
  transactions: PdfTransaction[];
}
