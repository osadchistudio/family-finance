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
    const { categoryId, learnFromThis } = body;

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

    // If user wants the system to learn from this
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

      // Also update all similar transactions that are uncategorized
      const searchTerm = keyword || transaction.description.substring(0, 10);
      const result = await prisma.transaction.updateMany({
        where: {
          description: {
            contains: searchTerm,
            mode: 'insensitive'
          },
          categoryId: null,
          id: { not: id } // Exclude current transaction
        },
        data: {
          categoryId,
          isAutoCategorized: true
        }
      });

      updatedSimilar = result.count;
    }

    return NextResponse.json({
      success: true,
      transaction: updated,
      learned: learnFromThis,
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
