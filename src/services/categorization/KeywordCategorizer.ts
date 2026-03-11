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
        category: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 4000,
    });

    const deduped = new Map<string, HistoricalCategorizationCandidate>();
    for (const tx of transactions) {
      const categoryId = tx.categoryId;
      if (!categoryId) {
        continue;
      }

      const candidate: HistoricalCategorizationCandidate = {
        description: tx.description,
        merchantName: tx.merchantName,
        categoryId,
        categoryName: tx.category?.name ?? 'לא מסווג',
      };

      const key = `${categoryId}:${compactText(tx.merchantName || tx.description)}`;
      if (!deduped.has(key)) {
        deduped.set(key, candidate);
      }
    }

    return [...deduped.values()];
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

    // Then try contains matches
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

    if (bestMatch) {
      return bestMatch;
    }

    const historicalCandidates = options?.historicalCandidates ?? [];
    let bestHistoricalMatch: CategorizationResult | null = null;
    let bestHistoricalScore = 0;

    for (const candidate of historicalCandidates) {
      const score = merchantSimilarityScore(
        description,
        candidate.merchantName || candidate.description
      );

      if (score >= 0.88 && score > bestHistoricalScore) {
        bestHistoricalScore = score;
        bestHistoricalMatch = {
          categoryId: candidate.categoryId,
          categoryName: candidate.categoryName,
          confidence: Math.min(score, 0.97),
          matchedKeyword: `history:${candidate.merchantName || candidate.description}`,
        };
      }
    }

    return bestHistoricalMatch;
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
