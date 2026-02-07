import { prisma } from '@/lib/prisma';
import { Category, CategoryKeyword } from '@prisma/client';

interface CategorizationResult {
  categoryId: string;
  categoryName: string;
  confidence: number;
  matchedKeyword: string;
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

  async categorize(description: string): Promise<CategorizationResult | null> {
    await this.ensureLoaded();

    const normalizedDesc = this.normalize(description);

    // First try exact matches (higher confidence)
    for (const kw of this.keywords) {
      if (kw.isExact && normalizedDesc === this.normalize(kw.keyword)) {
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
        const normalizedKeyword = this.normalize(kw.keyword);
        if (normalizedDesc.includes(normalizedKeyword)) {
          // Prefer longer matches (more specific)
          if (normalizedKeyword.length > bestMatchLength) {
            bestMatchLength = normalizedKeyword.length;
            const confidence = Math.min(normalizedKeyword.length / normalizedDesc.length * 1.5, 0.95);
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

  private normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\u0590-\u05FFa-z0-9\s]/g, '') // Keep Hebrew, alphanumeric, and spaces
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Refresh keywords from database
  async refresh(): Promise<void> {
    this.loaded = false;
    await this.loadKeywords();
  }
}

export const keywordCategorizer = new KeywordCategorizer();
