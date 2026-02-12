import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractKeyword } from '@/lib/keywords';

/**
 * Toggle recurring status on a transaction and optionally learn the keyword
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { isRecurring, learnFromThis, applyToIdentical = false } = body;

    const transaction = await prisma.transaction.findUnique({
      where: { id }
    });

    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    // Update the transaction
    await prisma.transaction.update({
      where: { id },
      data: { isRecurring }
    });

    let updatedIdentical = 0;
    if (applyToIdentical) {
      const identical = await prisma.transaction.updateMany({
        where: {
          id: { not: id },
          categoryId: transaction.categoryId,
          description: {
            equals: transaction.description,
            mode: 'insensitive'
          },
          amount: transaction.amount
        },
        data: { isRecurring }
      });
      updatedIdentical = identical.count;
    }

    let updatedSimilar = 0;
    let keywordAdded: string | null = null;

    if (learnFromThis) {
      const keyword = extractKeyword(transaction.description);

      if (keyword) {
        if (isRecurring) {
          // Learn: add keyword to RecurringKeyword table
          try {
            await prisma.recurringKeyword.upsert({
              where: { keyword: keyword.toLowerCase() },
              create: { keyword: keyword.toLowerCase() },
              update: {} // Already exists, no-op
            });
            keywordAdded = keyword.toLowerCase();
          } catch {
            // Keyword might already exist
          }

          // Cascade: mark all matching transactions as recurring
          const result = await prisma.transaction.updateMany({
            where: {
              description: {
                contains: keyword,
                mode: 'insensitive'
              },
              isRecurring: false,
              id: { not: id }
            },
            data: { isRecurring: true }
          });

          updatedSimilar = result.count;
        } else {
          // Unlearn: remove keyword from RecurringKeyword
          try {
            await prisma.recurringKeyword.delete({
              where: { keyword: keyword.toLowerCase() }
            });
          } catch {
            // Keyword might not exist
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      isRecurring,
      updatedSimilar,
      updatedIdentical,
      keywordAdded
    });
  } catch (error) {
    console.error('Update recurring error:', error);
    return NextResponse.json(
      { error: 'Failed to update recurring status' },
      { status: 500 }
    );
  }
}
