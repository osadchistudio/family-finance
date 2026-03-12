import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractMerchantSignature, isLikelySameMerchant } from '@/lib/merchantSimilarity';
import { stripTrailingFinalDot } from '@/lib/text-utils';

const MAX_SAFE_SIMILAR_UPDATES = 15;

type EditableTransaction = {
  id: string;
  accountId: string;
  fileUploadId: string | null;
  date: Date;
  valueDate: Date | null;
  amount: Prisma.Decimal;
  description: string;
  merchantName: string | null;
  categoryId: string | null;
  isAutoCategorized: boolean;
  reference: string | null;
  notes: string | null;
  isExcluded: boolean;
  isRecurring: boolean;
};

function mergeNotes(primary: string | null, secondary: string | null): string | null {
  const first = primary?.trim() || '';
  const second = secondary?.trim() || '';

  if (!first && !second) return null;
  if (!first) return second;
  if (!second) return first;
  if (first === second) return first;

  return `${first}\n\n${second}`;
}

async function findConflictingTransaction(
  tx: Prisma.TransactionClient,
  source: EditableTransaction,
  description: string
) {
  return tx.transaction.findFirst({
    where: {
      id: { not: source.id },
      accountId: source.accountId,
      date: source.date,
      amount: source.amount,
      description,
    },
    include: {
      category: true,
    },
  });
}

async function mergeIntoExistingTransaction(
  tx: Prisma.TransactionClient,
  source: EditableTransaction,
  targetId: string,
  description: string
) {
  const target = await tx.transaction.findUnique({
    where: { id: targetId },
    include: {
      category: true,
    },
  });

  if (!target) {
    throw new Error('Conflicting transaction was not found during merge');
  }

  const mergedCategoryId = target.categoryId ?? source.categoryId ?? null;
  const mergedAutoCategorized = mergedCategoryId
    ? (target.categoryId ? target.isAutoCategorized : source.isAutoCategorized)
    : false;

  const updatedTarget = await tx.transaction.update({
    where: { id: target.id },
    data: {
      description,
      merchantName: description,
      categoryId: mergedCategoryId,
      isAutoCategorized: mergedAutoCategorized,
      reference: target.reference ?? source.reference,
      notes: mergeNotes(target.notes, source.notes),
      isExcluded: target.isExcluded || source.isExcluded,
      isRecurring: target.isRecurring || source.isRecurring,
      valueDate: target.valueDate ?? source.valueDate,
      fileUploadId: target.fileUploadId ?? source.fileUploadId,
    },
    include: {
      category: true,
    },
  });

  await tx.transaction.delete({
    where: { id: source.id },
  });

  return updatedTarget;
}

async function updateDescriptionOrMerge(
  tx: Prisma.TransactionClient,
  source: EditableTransaction,
  description: string
) {
  try {
    const updated = await tx.transaction.update({
      where: { id: source.id },
      data: {
        description,
        merchantName: description,
      },
      include: {
        category: true,
      },
    });

    return {
      transaction: updated,
      mergedIntoExisting: false,
      deletedTransactionId: null as string | null,
      attachedToExistingCategory: false,
    };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      throw error;
    }

    const conflictingTransaction = await findConflictingTransaction(tx, source, description);
    if (!conflictingTransaction) {
      throw error;
    }

    const merged = await mergeIntoExistingTransaction(tx, source, conflictingTransaction.id, description);
    return {
      transaction: merged,
      mergedIntoExisting: true,
      deletedTransactionId: source.id,
      attachedToExistingCategory: Boolean(conflictingTransaction.categoryId),
    };
  }
}

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
        fileUploadId: true,
        date: true,
        valueDate: true,
        amount: true,
        description: true,
        merchantName: true,
        categoryId: true,
        isAutoCategorized: true,
        reference: true,
        notes: true,
        isExcluded: true,
        isRecurring: true,
      },
    });

    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    const primaryUpdateResult = await prisma.$transaction((tx) => (
      updateDescriptionOrMerge(tx, transaction, description)
    ));
    const primaryUpdated = primaryUpdateResult.transaction;
    const primaryDeletedTransactionId = primaryUpdateResult.deletedTransactionId;
    const mergedIntoExisting = primaryUpdateResult.mergedIntoExisting;
    const attachedToExistingCategory = primaryUpdateResult.attachedToExistingCategory;

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
          id: {
            notIn: [id, ...(primaryDeletedTransactionId ? [primaryUpdated.id] : [])],
          },
          accountId: transaction.accountId,
          isExcluded: false,
          ...(sourceIsExpense ? { amount: { lt: 0 } } : { amount: { gt: 0 } }),
        },
        select: {
          id: true,
          accountId: true,
          fileUploadId: true,
          date: true,
          valueDate: true,
          amount: true,
          description: true,
          merchantName: true,
          categoryId: true,
          isAutoCategorized: true,
          reference: true,
          notes: true,
          isExcluded: true,
          isRecurring: true,
        },
      });

      const similarCandidates = candidates
        .filter((candidate) => isLikelySameMerchant(transaction.description, candidate.description));
      const similarIds = similarCandidates.map((candidate) => candidate.id);

      matchedSimilarCount = similarIds.length;

      if (similarIds.length > MAX_SAFE_SIMILAR_UPDATES) {
        propagationSkipped = true;
        propagationSkippedDueToSafety = true;
      } else {
        for (const candidate of similarCandidates) {
          const result = await prisma.$transaction((tx) => (
            updateDescriptionOrMerge(tx, candidate, description)
          ));

          if (result.mergedIntoExisting) {
            skippedConflictCount += 1;
            continue;
          }

          updatedSimilarIds.push(candidate.id);
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
      mergedIntoExisting,
      deletedTransactionId: primaryDeletedTransactionId,
      attachedToExistingCategory,
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
