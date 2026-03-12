import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractMerchantSignature, isLikelySameMerchant } from '@/lib/merchantSimilarity';
import { stripTrailingFinalDot } from '@/lib/text-utils';

const MAX_SAFE_SIMILAR_UPDATES = 15;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const requestedDescription = typeof body?.description === 'string' ? body.description : '';
    const applyToSimilar = body?.applyToSimilar === true;
    const description = stripTrailingFinalDot(requestedDescription).trim();

    if (!description) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }

    const transaction = await prisma.transaction.findUnique({
      where: { id },
      select: {
        id: true,
        accountId: true,
        amount: true,
        description: true,
      },
    });

    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    let primaryUpdated = null;
    try {
      primaryUpdated = await prisma.transaction.update({
        where: { id },
        data: {
          description,
          merchantName: description,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return NextResponse.json(
          { error: 'כבר קיימת תנועה זהה עם התיאור החדש באותו חשבון, תאריך וסכום' },
          { status: 409 }
        );
      }
      throw error;
    }

    let matchedSimilarCount = 0;
    let updatedSimilarIds: string[] = [];
    let propagationSkipped = false;
    let propagationSkippedDueToSafety = false;
    let skippedConflictCount = 0;

    const sourceSignature = extractMerchantSignature(transaction.description);
    const sourceAmount = parseFloat(transaction.amount.toString());
    const sourceIsExpense = Number.isFinite(sourceAmount) ? sourceAmount < 0 : true;

    if (applyToSimilar && sourceSignature) {
      const candidates = await prisma.transaction.findMany({
        where: {
          id: { not: id },
          accountId: transaction.accountId,
          isExcluded: false,
          ...(sourceIsExpense ? { amount: { lt: 0 } } : { amount: { gt: 0 } }),
        },
        select: {
          id: true,
          description: true,
        },
      });

      const similarIds = candidates
        .filter((candidate) => isLikelySameMerchant(transaction.description, candidate.description))
        .map((candidate) => candidate.id);

      matchedSimilarCount = similarIds.length;

      if (similarIds.length > MAX_SAFE_SIMILAR_UPDATES) {
        propagationSkipped = true;
        propagationSkippedDueToSafety = true;
      } else {
        for (const similarId of similarIds) {
          try {
            await prisma.transaction.update({
              where: { id: similarId },
              data: {
                description,
                merchantName: description,
              },
            });
            updatedSimilarIds.push(similarId);
          } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
              skippedConflictCount += 1;
              continue;
            }
            throw error;
          }
        }
      }
    } else if (applyToSimilar) {
      propagationSkipped = true;
    }

    revalidatePath('/');
    revalidatePath('/transactions');
    revalidatePath('/monthly-summary');
    revalidatePath('/recurring');
    revalidatePath('/upload');

    return NextResponse.json({
      success: true,
      transaction: primaryUpdated,
      updatedSimilar: updatedSimilarIds.length,
      updatedSimilarIds,
      matchedSimilarCount,
      propagationSkipped,
      propagationSkippedDueToSafety,
      skippedConflictCount,
    });
  } catch (error) {
    console.error('Update description error:', error);
    return NextResponse.json(
      { error: 'Failed to update description' },
      { status: 500 }
    );
  }
}
