import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import {
  type AutoCategorizeCategory,
  extractKeyword,
  findCategoryByName,
  identifyDescriptions,
  resolveCategoryForDescription,
  resolveOpenAiApiKey,
} from '@/lib/autoCategorize';
import { extractMerchantSignature, isLikelySameMerchant } from '@/lib/merchantSimilarity';
import { keywordCategorizer } from '@/services/categorization/KeywordCategorizer';

const MAX_SAFE_SIMILAR_UPDATES = 15;

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

    const categories: AutoCategorizeCategory[] = await prisma.category.findMany({
      include: {
        keywords: true,
      },
    });

    const historicalCandidates = await keywordCategorizer.loadHistoricalCandidates();
    const learnedCategorization = await keywordCategorizer.categorize(transaction.description, {
      historicalCandidates,
    });

    let category = learnedCategorization
      ? categories.find(candidate => candidate.id === learnedCategorization.categoryId)
      : undefined;

    if (!category) {
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

      category = findCategoryByName(categories, categoryName);
      if (!category) {
        return NextResponse.json({
          success: true,
          categorized: false,
          message: 'ה-AI החזיר קטגוריה לא זמינה',
        });
      }
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

    const sourceSignature = extractMerchantSignature(transaction.description);
    let updatedSimilarIds: string[] = [];

    let propagationSkippedDueToSafety = false;
    let matchedSimilarCount = 0;

    if (sourceSignature) {
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

      updatedSimilarIds = candidates
        .filter(candidate => isLikelySameMerchant(transaction.description, candidate.description))
        .map(candidate => candidate.id);

      matchedSimilarCount = updatedSimilarIds.length;

      if (updatedSimilarIds.length > MAX_SAFE_SIMILAR_UPDATES) {
        propagationSkippedDueToSafety = true;
        updatedSimilarIds = [];
      } else if (updatedSimilarIds.length > 0) {
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
    const categorizationSource = learnedCategorization?.matchedKeyword?.startsWith('history:')
      ? 'history'
      : learnedCategorization
        ? 'keywords'
        : 'ai';

    revalidatePath('/transactions');
    revalidatePath('/recurring');
    revalidatePath('/');

    return NextResponse.json({
      success: true,
      categorized,
      transactionId: transaction.id,
      updatedSimilar: updatedSimilarIds.length,
      updatedSimilarIds,
      propagationSkippedDueToSafety,
      matchedSimilarCount,
      category: {
        id: category.id,
        name: category.name,
        icon: category.icon || '📁',
        color: category.color || '#6B7280',
      },
      source: categorizationSource,
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
