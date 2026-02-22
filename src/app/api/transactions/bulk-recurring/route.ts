import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';

interface BulkRecurringBody {
  transactionIds?: unknown;
  isRecurring?: unknown;
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as BulkRecurringBody;

    if (!Array.isArray(body.transactionIds)) {
      return NextResponse.json({ error: 'transactionIds must be an array' }, { status: 400 });
    }

    const transactionIds = Array.from(
      new Set(
        body.transactionIds
          .filter((id): id is string => typeof id === 'string')
          .map((id) => id.trim())
          .filter(Boolean)
      )
    );

    if (transactionIds.length === 0) {
      return NextResponse.json({ error: 'No transaction ids provided' }, { status: 400 });
    }

    const isRecurring = Boolean(body.isRecurring);

    const result = await prisma.transaction.updateMany({
      where: {
        id: { in: transactionIds },
        isExcluded: false,
      },
      data: {
        isRecurring,
      },
    });

    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/recurring');
    revalidatePath('/monthly-summary');
    revalidatePath('/tips');

    return NextResponse.json({
      success: true,
      updatedCount: result.count,
      isRecurring,
    });
  } catch (error) {
    console.error('Bulk recurring update error:', error);
    return NextResponse.json(
      { error: 'Failed to update recurring transactions' },
      { status: 500 }
    );
  }
}
