import { prisma } from '@/lib/prisma';
import { Category, CategoryKeyword } from '@prisma/client';
import { compactText, merchantSimilarityScore, normalizeText } from '@/lib/merchantSimilarity';

export interface CategorizationResult {
  categoryId: string;
  categoryName: string;
  confidence: number;
  matchedKeyword: string;
}

export interface HistoricalCategorizationCandidate {
  description: string;
  merchantName?: string | null;
  categoryId: string;
  categoryName: string;
  sampleCount: number;
}

interface KeywordWithCategory extends CategoryKeyword {
  category: Category;
}

export class KeywordCategorizer {
  private keywords: KeywordWithCategory[] = [];
  private loaded = false;

  async loadKeywords(): Promise<void> {
    this.keywords = await prisma.categoryKeyword.findMany({
      include: { category: true },
      orderBy: { priority: 'desc' }
    });
    this.loaded = true;
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) {
      await this.loadKeywords();
    }
  }

  async loadHistoricalCandidates(): Promise<HistoricalCategorizationCandidate[]> {
    const transactions = await prisma.transaction.findMany({
      where: {
        categoryId: { not: null },
      },
      select: {
        description: true,
        merchantName: true,
        categoryId: true,
        updatedAt: true,
        category: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const groupedByMerchant = new Map<
      string,
      {
        categories: Map<string, {
          categoryName: string;
          count: number;
          latestUpdatedAt: Date;
          description: string;
          merchantName?: string | null;
        }>;
      }
    >();

    for (const tx of transactions) {
      const categoryId = tx.categoryId;
      if (!categoryId) {
        continue;
      }

      const merchantKey = compactText(tx.merchantName || tx.description);
      if (!merchantKey) {
        continue;
      }

      const existingGroup = groupedByMerchant.get(merchantKey) ?? {
        categories: new Map<string, {
          categoryName: string;
          count: number;
          latestUpdatedAt: Date;
          description: string;
          merchantName?: string | null;
        }>(),
      };

      const existingCategory = existingGroup.categories.get(categoryId) ?? {
        categoryName: tx.category?.name ?? 'לא מסווג',
        count: 0,
        latestUpdatedAt: tx.updatedAt,
        description: tx.description,
        merchantName: tx.merchantName,
      };

      existingCategory.count += 1;
      if (tx.updatedAt >= existingCategory.latestUpdatedAt) {
        existingCategory.latestUpdatedAt = tx.updatedAt;
        existingCategory.description = tx.description;
        existingCategory.merchantName = tx.merchantName;
      }
      existingGroup.categories.set(categoryId, existingCategory);
      groupedByMerchant.set(merchantKey, existingGroup);
    }

    const dominantCandidates: HistoricalCategorizationCandidate[] = [];

    for (const group of groupedByMerchant.values()) {
      const rankedCategories = [...group.categories.entries()]
        .map(([categoryId, value]) => ({
          categoryId,
          categoryName: value.categoryName,
          count: value.count,
          latestUpdatedAt: value.latestUpdatedAt,
          description: value.description,
          merchantName: value.merchantName,
        }))
        .sort((left, right) => {
          if (right.count !== left.count) {
            return right.count - left.count;
          }
          return right.latestUpdatedAt.getTime() - left.latestUpdatedAt.getTime();
        });

      const topCategory = rankedCategories[0];
      const secondCategory = rankedCategories[1];
      const totalCount = rankedCategories.reduce((sum, category) => sum + category.count, 0);

      if (!topCategory) {
        continue;
      }

      const dominanceRatio = totalCount > 0 ? topCategory.count / totalCount : 0;
      const isAmbiguous =
        topCategory.count < 2 ||
        dominanceRatio < 0.7 ||
        (
          secondCategory &&
          topCategory.count === secondCategory.count
        );

      if (isAmbiguous) {
        continue;
      }

      dominantCandidates.push({
        description: topCategory.description,
        merchantName: topCategory.merchantName,
        categoryId: topCategory.categoryId,
        categoryName: topCategory.categoryName,
        sampleCount: topCategory.count,
      });
    }

    return dominantCandidates;
  }

  async categorize(
    description: string,
    options?: {
      historicalCandidates?: HistoricalCategorizationCandidate[];
    }
  ): Promise<CategorizationResult | null> {
    await this.ensureLoaded();

    const normalizedDesc = normalizeText(description);
    const compactDesc = compactText(description);

    // First try exact matches (higher confidence)
    for (const kw of this.keywords) {
      const normalizedKeyword = normalizeText(kw.keyword);
      const compactKeyword = compactText(kw.keyword);
      if (
        kw.isExact &&
        (normalizedDesc === normalizedKeyword || compactDesc === compactKeyword)
      ) {
        return {
          categoryId: kw.categoryId,
          categoryName: kw.category.name,
          confidence: 1.0,
          matchedKeyword: kw.keyword
        };
      }
    }

    const historicalCandidates = options?.historicalCandidates ?? [];
    let bestHistoricalMatch: CategorizationResult | null = null;
    let bestHistoricalScore = 0;

    for (const candidate of historicalCandidates) {
      const similarityScore = merchantSimilarityScore(
        description,
        candidate.merchantName || candidate.description
      );
      const score = Math.min(
        similarityScore + Math.min(Math.max(candidate.sampleCount - 1, 0) * 0.01, 0.03),
        0.99
      );

      if (similarityScore >= 0.88 && score > bestHistoricalScore) {
        bestHistoricalScore = score;
        bestHistoricalMatch = {
          categoryId: candidate.categoryId,
          categoryName: candidate.categoryName,
          confidence: Math.min(score, 0.97),
          matchedKeyword: `history:${candidate.merchantName || candidate.description}`,
        };
      }
    }

    if (bestHistoricalMatch) {
      return bestHistoricalMatch;
    }

    // Only after exact and learned-history matches do we try broader contains rules.
    let bestMatch: CategorizationResult | null = null;
    let bestMatchLength = 0;

    for (const kw of this.keywords) {
      if (!kw.isExact) {
        const normalizedKeyword = normalizeText(kw.keyword);
        const compactKeyword = compactText(kw.keyword);
        if (
          normalizedDesc.includes(normalizedKeyword) ||
          compactDesc.includes(compactKeyword)
        ) {
          // Prefer longer matches (more specific)
          const candidateLength = Math.max(normalizedKeyword.length, compactKeyword.length);
          if (candidateLength > bestMatchLength) {
            bestMatchLength = candidateLength;
            const confidence = Math.min(candidateLength / Math.max(compactDesc.length, 1) * 1.5, 0.95);
            bestMatch = {
              categoryId: kw.categoryId,
              categoryName: kw.category.name,
              confidence,
              matchedKeyword: kw.keyword
            };
          }
        }
      }
    }

    return bestMatch;
  }

  async categorizeMany(descriptions: string[]): Promise<Map<string, CategorizationResult | null>> {
    await this.ensureLoaded();

    const results = new Map<string, CategorizationResult | null>();
    for (const desc of descriptions) {
      results.set(desc, await this.categorize(desc));
    }
    return results;
  }
  // Refresh keywords from database
  async refresh(): Promise<void> {
    this.loaded = false;
    await this.loadKeywords();
  }
}

export const keywordCategorizer = new KeywordCategorizer();
