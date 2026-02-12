import { Institution } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const BANK_INSTITUTIONS: Institution[] = ['BANK_HAPOALIM', 'BANK_LEUMI', 'OTHER'];

const CARD_BILL_KEYWORDS = [
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

function isConsolidatedCardCharge(description: string): boolean {
  const normalized = description
    .toLowerCase()
    .replace(/[^\u0590-\u05FFa-z]/g, '');

  return CARD_BILL_KEYWORDS.some(keyword => normalized.includes(keyword));
}

function getMonthBounds(month: string): { gte: Date; lt: Date } | null {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return null;
  }

  const gte = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0));
  const lt = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0));
  return { gte, lt };
}

/**
 * Bulk-delete transactions based on specific cleanup modes.
 * Current mode: consolidatedCardCharges
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const mode = body?.mode;
    const accountId = typeof body?.accountId === 'string' && body.accountId.trim() ? body.accountId : null;
    const month = typeof body?.month === 'string' && body.month.trim() ? body.month : null;

    if (mode !== 'consolidatedCardCharges') {
      return NextResponse.json(
        { error: 'Unsupported bulk delete mode' },
        { status: 400 }
      );
    }

    const dateBounds = month ? getMonthBounds(month) : null;
    if (month && !dateBounds) {
      return NextResponse.json(
        { error: 'Invalid month format. Expected YYYY-MM' },
        { status: 400 }
      );
    }

    const candidates = await prisma.transaction.findMany({
      where: {
        isExcluded: false,
        amount: { lt: 0 },
        ...(accountId ? { accountId } : {}),
        ...(dateBounds ? { date: { gte: dateBounds.gte, lt: dateBounds.lt } } : {}),
      },
      select: {
        id: true,
        description: true,
        account: {
          select: {
            institution: true,
          },
        },
      },
    });

    const idsToDelete = candidates
      .filter(tx =>
        BANK_INSTITUTIONS.includes(tx.account.institution)
        && isConsolidatedCardCharge(tx.description)
      )
      .map(tx => tx.id);

    if (idsToDelete.length === 0) {
      return NextResponse.json({
        success: true,
        deleted: 0,
        deletedIds: [],
        scanned: candidates.length,
      });
    }

    await prisma.transaction.deleteMany({
      where: {
        id: { in: idsToDelete },
      },
    });

    return NextResponse.json({
      success: true,
      deleted: idsToDelete.length,
      deletedIds: idsToDelete,
      scanned: candidates.length,
    });
  } catch (error) {
    console.error('Bulk delete transactions error:', error);
    return NextResponse.json(
      { error: 'Failed to bulk delete transactions' },
      { status: 500 }
    );
  }
}

