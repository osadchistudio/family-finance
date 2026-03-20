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

type InheritedCategory = {
  categoryId: string;
  isAutoCategorized: boolean;
};

type DescriptionUpdateTransaction = Prisma.TransactionGetPayload<{
  include: {
    category: true;
  };
}>;

type DescriptionUpdateResult = {
  transaction: DescriptionUpdateTransaction;
  mergedIntoExisting: boolean;
  deletedTransactionId: string | null;
  attachedToExistingCategory: boolean;
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

async function findInheritedCategory(
  tx: Prisma.TransactionClient,
  source: EditableTransaction,
  description: string
): Promise<InheritedCategory | null> {
  const sourceAmount = parseFloat(source.amount.toString());
  const sourceIsExpense = Number.isFinite(sourceAmount) ? sourceAmount < 0 : true;

  const categorizedMatches = await tx.transaction.findMany({
    where: {
      id: { not: source.id },
      description,
      categoryId: { not: null },
      isExcluded: false,
      ...(sourceIsExpense ? { amount: { lt: 0 } } : { amount: { gt: 0 } }),
    },
    select: {
      categoryId: true,
      isAutoCategorized: true,
      date: true,
    },
    orderBy: {
      date: 'desc',
    },
  });

  if (categorizedMatches.length === 0) {
    return null;
  }

  const categoryStats = new Map<string, { count: number; latestDate: Date; isAutoCategorized: boolean }>();

  for (const match of categorizedMatches) {
    if (!match.categoryId) continue;

    const current = categoryStats.get(match.categoryId);
    if (!current) {
      categoryStats.set(match.categoryId, {
        count: 1,
        latestDate: match.date,
        isAutoCategorized: match.isAutoCategorized,
      });
      continue;
    }

    categoryStats.set(match.categoryId, {
      count: current.count + 1,
      latestDate: current.latestDate > match.date ? current.latestDate : match.date,
      isAutoCategorized: current.isAutoCategorized,
    });
  }

  const winner = Array.from(categoryStats.entries())
    .sort((left, right) => {
      const [, leftStats] = left;
      const [, rightStats] = right;

      if (rightStats.count !== leftStats.count) {
        return rightStats.count - leftStats.count;
      }

      return rightStats.latestDate.getTime() - leftStats.latestDate.getTime();
    })[0];

  if (!winner) {
    return null;
  }

  const [categoryId, stats] = winner;
  return {
    categoryId,
    isAutoCategorized: stats.isAutoCategorized,
  };
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
  description: string,
  inheritedCategory: InheritedCategory | null
): Promise<DescriptionUpdateTransaction> {
  const target = await tx.transaction.findUnique({
    where: { id: targetId },
    include: {
      category: true,
    },
  });

  if (!target) {
    throw new Error('Conflicting transaction was not found during merge');
  }

  const mergedCategoryId = target.categoryId ?? source.categoryId ?? inheritedCategory?.categoryId ?? null;
  const mergedAutoCategorized = mergedCategoryId
    ? (
      target.categoryId
        ? target.isAutoCategorized
        : source.categoryId
          ? source.isAutoCategorized
          : false
    )
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
  description: string,
  inheritedCategory: InheritedCategory | null
): Promise<DescriptionUpdateResult> {
  const shouldInheritCategory = Boolean(inheritedCategory?.categoryId && !source.categoryId);
  const conflictingTransaction = await findConflictingTransaction(tx, source, description);

  if (conflictingTransaction) {
    const merged = await mergeIntoExistingTransaction(
      tx,
      source,
      conflictingTransaction.id,
      description,
      inheritedCategory
    );

    return {
      transaction: merged,
      mergedIntoExisting: true,
      deletedTransactionId: source.id,
      attachedToExistingCategory: Boolean(merged.categoryId),
    };
  }

  try {
    const updated = await tx.transaction.update({
      where: { id: source.id },
      data: {
        description,
        merchantName: description,
        ...(shouldInheritCategory ? {
          categoryId: inheritedCategory?.categoryId,
          isAutoCategorized: false,
        } : {}),
      },
      include: {
        category: true,
      },
    });

    return {
      transaction: updated,
      mergedIntoExisting: false,
      deletedTransactionId: null as string | null,
      attachedToExistingCategory: shouldInheritCategory,
    };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      throw error;
    }

    // If another request created the duplicate after our preflight check,
    // recover by merging into the now-existing canonical row instead of failing.
    const conflictingTransaction = await findConflictingTransaction(tx, source, description);
    if (!conflictingTransaction) {
      throw error;
    }

    const merged = await mergeIntoExistingTransaction(
      tx,
      source,
      conflictingTransaction.id,
      description,
      inheritedCategory
    );

    return {
      transaction: merged,
      mergedIntoExisting: true,
      deletedTransactionId: source.id,
      attachedToExistingCategory: Boolean(merged.categoryId),
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

    const primaryUpdateResult = await prisma.$transaction(async (tx) => {
      const inheritedCategory = await findInheritedCategory(tx, transaction, description);
      return updateDescriptionOrMerge(tx, transaction, description, inheritedCategory);
    });
    const primaryUpdated = primaryUpdateResult.transaction;
    const primaryDeletedTransactionId = primaryUpdateResult.deletedTransactionId;
    const mergedIntoExisting = primaryUpdateResult.mergedIntoExisting;
    const attachedToExistingCategory = primaryUpdateResult.attachedToExistingCategory;

    const canonicalCategory = primaryUpdated.categoryId
      ? {
        categoryId: primaryUpdated.categoryId,
        isAutoCategorized: primaryUpdated.isAutoCategorized,
      }
      : null;

    let matchedSimilarCount = 0;
    let updatedSimilarIds: string[] = [];
    let propagationSkipped = false;
    let propagationSkippedDueToSafety = false;
    let mergedSimilarCount = 0;
    let failedSimilarCount = 0;
    const mergedSimilarDeletedIds: string[] = [];
    const mergedSimilarTransactions = new Map<string, DescriptionUpdateTransaction>();

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
          try {
            const result = await prisma.$transaction((tx) => (
              updateDescriptionOrMerge(tx, candidate, description, canonicalCategory)
            ));

            if (result.mergedIntoExisting) {
              mergedSimilarCount += 1;
              if (result.deletedTransactionId) {
                mergedSimilarDeletedIds.push(result.deletedTransactionId);
              }
              mergedSimilarTransactions.set(result.transaction.id, result.transaction);
              continue;
            }

            updatedSimilarIds.push(candidate.id);
          } catch (similarError) {
            failedSimilarCount += 1;
            console.error('Description propagation error:', {
              sourceTransactionId: id,
              candidateTransactionId: candidate.id,
              error: similarError,
            });
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
      mergedIntoExisting,
      deletedTransactionId: primaryDeletedTransactionId,
      attachedToExistingCategory,
      updatedSimilar: updatedSimilarIds.length,
      updatedSimilarIds,
      matchedSimilarCount,
      propagationSkipped,
      propagationSkippedDueToSafety,
      skippedConflictCount: 0,
      mergedSimilarCount,
      mergedSimilarDeletedIds,
      mergedSimilarTransactions: Array.from(mergedSimilarTransactions.values()),
      failedSimilarCount,
    });
  } catch (error) {
    console.error('Update description error:', error);
    return NextResponse.json(
      { error: 'שגיאה בעדכון שם העסקה' },
      { status: 500 }
    );
  }
}
