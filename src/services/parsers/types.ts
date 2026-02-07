import { Institution } from '@prisma/client';

export interface ParsedTransaction {
  date: Date;
  valueDate?: Date;
  description: string;
  amount: number;
  originalAmount?: number;
  originalCurrency?: string;
  reference?: string;
}

export interface ParseResult {
  institution: Institution;
  cardNumber?: string; // 4 ספרות אחרונות של הכרטיס (אם זוהה)
  transactions: ParsedTransaction[];
  rowCount: number;
  successCount: number;
  skippedRows: number; // summary/header/empty rows that were correctly skipped
  errors: string[];
}

export interface ParserConfig {
  institution: Institution;
  encoding: 'utf-8' | 'windows-1255';
  delimiter: ',' | '\t' | ';';
  dateFormat: string;
  headerRow: number;
  columnMapping: ColumnMapping;
}

export interface ColumnMapping {
  date: string | number;
  valueDate?: string | number;
  description: string | number;
  debit?: string | number;
  credit?: string | number;
  amount?: string | number;
  balance?: string | number;
  reference?: string | number;
  originalAmount?: string | number;
  originalCurrency?: string | number;
}
