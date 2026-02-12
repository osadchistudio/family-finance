import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractKeyword } from '@/lib/keywords';

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
    let keywordAdded = null;

    if (applyToSimilar) {
      // Optionally propagate category change to identical transactions (same description)
      const similarResult = await prisma.transaction.updateMany({
        where: {
          id: { not: id },
          description: {
            equals: transaction.description,
            mode: 'insensitive',
          },
          NOT: {
            categoryId: categoryId ?? null,
          },
        },
        data: {
          categoryId,
          isAutoCategorized: false,
        },
      });
      updatedSimilar = similarResult.count;
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
