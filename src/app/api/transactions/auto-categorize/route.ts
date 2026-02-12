import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  extractKeyword,
  findCategoryByName,
  identifyDescriptions,
  resolveAnthropicApiKey,
} from '@/lib/autoCategorize';

/**
 * Auto-categorize uncategorized transactions using AI
 */
export async function POST() {
  try {
    // Get all uncategorized transactions
    const uncategorizedTransactions = await prisma.transaction.findMany({
      where: { categoryId: null },
      select: {
        id: true,
        description: true,
        amount: true,
      },
      take: 100, // Limit to avoid long processing
    });

    if (uncategorizedTransactions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'אין עסקאות לסיווג',
        categorized: 0,
      });
    }

    // Get all categories with their keywords
    const categories = await prisma.category.findMany({
      include: {
        keywords: true,
      },
    });

    // Prepare business descriptions for AI
    const uniqueDescriptions = [...new Set(uncategorizedTransactions.map(t => t.description))];

    const anthropicKey = await resolveAnthropicApiKey();
    const categorizations = await identifyDescriptions(uniqueDescriptions, categories, anthropicKey);

    // Apply categorizations
    let categorizedCount = 0;
    const keywordsToAdd: { categoryId: string; keyword: string }[] = [];

    for (const tx of uncategorizedTransactions) {
      const categoryName = categorizations[tx.description];
      if (categoryName) {
        const category = findCategoryByName(categories, categoryName);

        if (category) {
          await prisma.transaction.update({
            where: { id: tx.id },
            data: {
              categoryId: category.id,
              isAutoCategorized: true,
            },
          });
          categorizedCount++;

          // Remember to add keyword
          const keyword = extractKeyword(tx.description);
          if (keyword && !keywordsToAdd.find(k => k.keyword === keyword && k.categoryId === category.id)) {
            keywordsToAdd.push({ categoryId: category.id, keyword });
          }
        }
      }
    }

    // Add new keywords for future categorization
    for (const kw of keywordsToAdd) {
      try {
        await prisma.categoryKeyword.create({
          data: {
            categoryId: kw.categoryId,
            keyword: kw.keyword.toLowerCase(),
            isExact: false,
            priority: 0,
          },
        });
      } catch {
        // Keyword might already exist
      }
    }

    return NextResponse.json({
      success: true,
      message: `סווגו ${categorizedCount} עסקאות בהצלחה`,
      categorized: categorizedCount,
      total: uncategorizedTransactions.length,
      newKeywords: keywordsToAdd.length,
    });
  } catch (error) {
    console.error('Auto-categorize error:', error);
    return NextResponse.json(
      { error: 'שגיאה בסיווג אוטומטי' },
      { status: 500 }
    );
  }
}
