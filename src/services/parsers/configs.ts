import { Institution } from '@prisma/client';
import { ParserConfig } from './types';

export const PARSER_CONFIGS: Record<Institution, ParserConfig> = {
  BANK_HAPOALIM: {
    institution: 'BANK_HAPOALIM',
    encoding: 'windows-1255',
    delimiter: ',',
    dateFormat: 'DD/MM/YYYY',
    headerRow: 0,
    columnMapping: {
      date: 'תאריך',
      description: 'תיאור',
      reference: 'אסמכתא',
      debit: 'חובה',
      credit: 'זכות',
      balance: 'יתרה'
    }
  },
  BANK_LEUMI: {
    institution: 'BANK_LEUMI',
    encoding: 'utf-8',
    delimiter: ',',
    dateFormat: 'DD/MM/YYYY',
    headerRow: 0,
    columnMapping: {
      date: 'תאריך',
      valueDate: 'תאריך ערך',
      description: 'תיאור',
      reference: 'אסמכתא',
      debit: 'חובה',
      credit: 'זכות',
      balance: 'יתרה'
    }
  },
  ISRACARD: {
    institution: 'ISRACARD',
    encoding: 'utf-8',
    delimiter: ',',
    dateFormat: 'DD.MM.YY',
    headerRow: 0,
    columnMapping: {
      date: 'תאריך עסקה',
      valueDate: 'תאריך חיוב',
      description: 'שם בית עסק',
      amount: 'סכום חיוב',
      originalAmount: 'סכום עסקה',
      originalCurrency: 'מטבע עסקה'
    }
  },
  LEUMI_CARD: {
    institution: 'LEUMI_CARD',
    encoding: 'windows-1255',
    delimiter: ',',
    dateFormat: 'DD/MM/YYYY',
    headerRow: 0,
    columnMapping: {
      date: 'תאריך',
      description: 'שם בית עסק',
      amount: 'סכום',
      originalAmount: 'סכום מקורי',
      originalCurrency: 'מטבע מקור'
    }
  },
  OTHER: {
    institution: 'OTHER',
    encoding: 'utf-8',
    delimiter: ',',
    dateFormat: 'DD/MM/YYYY',
    headerRow: 0,
    columnMapping: {
      date: 0,
      description: 1,
      amount: 2
    }
  }
};

// Detection markers for auto-detecting institution from file content
export const INSTITUTION_MARKERS: Record<Institution, string[]> = {
  BANK_HAPOALIM: ['בנק הפועלים', 'hapoalim', 'פועלים'],
  BANK_LEUMI: ['בנק לאומי', 'leumi bank', 'לאומי לישראל'],
  ISRACARD: ['ישראכרט', 'isracard', 'כרטיסי ישראל', 'פירוט עסקאות', 'מועד חיוב'],
  LEUMI_CARD: ['לאומי קארד', 'leumi card', 'לאומי-קארד', 'max לאומי', 'מקס'],
  OTHER: []
};

// Alternative column names for flexible matching
export const COLUMN_ALIASES: Record<string, string[]> = {
  'תאריך עסקה': ['תאריך עסקה', 'תאריך העסקה', 'תאריך'],
  'שם בית עסק': ['שם בית עסק', 'שם בית העסק', 'בית עסק', 'תיאור'],
  'סכום חיוב': ['סכום חיוב', 'סכום לחיוב', 'סכום בש"ח', 'סכום'],
  'סכום עסקה': ['סכום עסקה', 'סכום מקורי', 'סכום העסקה'],
  'תאריך חיוב': ['תאריך חיוב', 'מועד חיוב', 'תאריך החיוב'],
  'מטבע עסקה': ['מטבע עסקה', 'מטבע', 'מטבע מקור']
};
