import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractKeyword } from '@/lib/keywords';
import { isLikelySameMerchant } from '@/lib/merchantSimilarity';

/**
 * Update transaction category and optionally learn for future
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { categoryId, learnFromThis, applyToSimilar = true } = body;

    // Get the transaction
    const transaction = await prisma.transaction.findUnique({
      where: { id }
    });

    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    // Update the transaction
    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        categoryId,
        isAutoCategorized: false // Marked as manually categorized
      },
      include: {
        category: true
      }
    });

    let updatedSimilar = 0;
    let updatedSimilarIds: string[] = [];
    let keywordAdded = null;

    if (applyToSimilar) {
      const sourceAmount = parseFloat(transaction.amount.toString());
      const sourceIsExpense = Number.isFinite(sourceAmount) ? sourceAmount < 0 : true;

      // Find similar merchant transactions (not only identical description).
      const candidates = await prisma.transaction.findMany({
        where: {
          id: { not: id },
          isExcluded: false,
          NOT: {
            categoryId: categoryId ?? null,
          },
          ...(sourceIsExpense
            ? { amount: { lt: 0 } }
            : { amount: { gt: 0 } }),
        },
        select: {
          id: true,
          description: true,
        }
      });

      updatedSimilarIds = candidates
        .filter(candidate => isLikelySameMerchant(transaction.description, candidate.description))
        .map(candidate => candidate.id);

      if (updatedSimilarIds.length > 0) {
        await prisma.transaction.updateMany({
          where: {
            id: { in: updatedSimilarIds }
          },
          data: {
            categoryId,
            isAutoCategorized: false,
          },
        });
      }

      updatedSimilar = updatedSimilarIds.length;
    }

    // If user wants the system to learn from this (future transactions)
    if (learnFromThis && categoryId) {
      // Extract a keyword from the description
      const keyword = extractKeyword(transaction.description);

      if (keyword) {
        // Check if keyword already exists for this category
        const existingKeyword = await prisma.categoryKeyword.findFirst({
          where: {
            keyword: keyword.toLowerCase(),
            categoryId
          }
        });

        if (!existingKeyword) {
          // Add new keyword
          await prisma.categoryKeyword.create({
            data: {
              categoryId,
              keyword: keyword.toLowerCase()
            }
          });
          keywordAdded = keyword.toLowerCase();
        }
      }

    }

    return NextResponse.json({
      success: true,
      transaction: updated,
      learned: learnFromThis,
      appliedToSimilar: applyToSimilar,
      updatedSimilar,
      updatedSimilarIds,
      keywordAdded
    });
  } catch (error) {
    console.error('Update category error:', error);
    return NextResponse.json(
      { error: 'Failed to update category' },
      { status: 500 }
    );
  }
}
