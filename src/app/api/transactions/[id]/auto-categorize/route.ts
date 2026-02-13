import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  extractKeyword,
  findCategoryByName,
  identifyDescriptions,
  resolveCategoryForDescription,
  resolveOpenAiApiKey,
} from '@/lib/autoCategorize';
import { isLikelySameMerchant } from '@/lib/merchantSimilarity';

/**
 * Auto-categorize a single transaction by id
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const transaction = await prisma.transaction.findUnique({
      where: { id },
      select: {
        id: true,
        description: true,
        amount: true,
        categoryId: true,
      },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: 'העסקה לא נמצאה' },
        { status: 404 }
      );
    }

    const categories = await prisma.category.findMany({
      include: {
        keywords: true,
      },
    });

    const openaiKey = await resolveOpenAiApiKey();
    const categorizations = await identifyDescriptions(
      [transaction.description],
      categories,
      openaiKey,
      { includeKeywordFallback: false }
    );

    const categoryName = resolveCategoryForDescription(categorizations, transaction.description);
    if (!categoryName) {
      return NextResponse.json({
        success: true,
        categorized: false,
        message: 'לא נמצאה קטגוריה מתאימה לעסקה הזו',
      });
    }

    const category = findCategoryByName(categories, categoryName);
    if (!category) {
      return NextResponse.json({
        success: true,
        categorized: false,
        message: 'ה-AI החזיר קטגוריה לא זמינה',
      });
    }

    let currentUpdated = 0;
    if (transaction.categoryId !== category.id) {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          categoryId: category.id,
          isAutoCategorized: true,
        },
      });
      currentUpdated = 1;
    }

    const sourceAmount = parseFloat(transaction.amount.toString());
    const sourceIsExpense = Number.isFinite(sourceAmount) ? sourceAmount < 0 : true;

    const candidates = await prisma.transaction.findMany({
      where: {
        id: { not: transaction.id },
        isExcluded: false,
        NOT: {
          categoryId: category.id,
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

    const updatedSimilarIds = candidates
      .filter(candidate => isLikelySameMerchant(transaction.description, candidate.description))
      .map(candidate => candidate.id);

    if (updatedSimilarIds.length > 0) {
      await prisma.transaction.updateMany({
        where: {
          id: { in: updatedSimilarIds },
        },
        data: {
          categoryId: category.id,
          isAutoCategorized: true,
        },
      });
    }

    const keyword = extractKeyword(transaction.description);
    if (keyword) {
      try {
        await prisma.categoryKeyword.create({
          data: {
            categoryId: category.id,
            keyword: keyword.toLowerCase(),
            isExact: false,
            priority: 0,
          },
        });
      } catch {
        // Keyword might already exist
      }
    }

    const categorized = currentUpdated > 0 || updatedSimilarIds.length > 0;

    return NextResponse.json({
      success: true,
      categorized,
      transactionId: transaction.id,
      updatedSimilar: updatedSimilarIds.length,
      updatedSimilarIds,
      category: {
        id: category.id,
        name: category.name,
        icon: category.icon || '📁',
        color: category.color || '#6B7280',
      },
      message: categorized
        ? null
        : 'בוצעה בדיקת AI והתנועה כבר משויכת לקטגוריה המתאימה',
      keywordAdded: keyword?.toLowerCase() || null,
    });
  } catch (error) {
    console.error('Single auto-categorize error:', error);
    return NextResponse.json(
      { error: 'שגיאה בסיווג אוטומטי לתנועה' },
      { status: 500 }
    );
  }
}
