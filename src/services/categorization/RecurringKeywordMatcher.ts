import { prisma } from '@/lib/prisma';
import { compactText, normalizeText } from '@/lib/merchantSimilarity';

export class RecurringKeywordMatcher {
  private keywords: string[] = [];
  private loaded = false;

  async loadKeywords(): Promise<void> {
    const records = await prisma.recurringKeyword.findMany();
    this.keywords = records.map(r => r.keyword.toLowerCase());
    this.loaded = true;
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) {
      await this.loadKeywords();
    }
  }

  async match(description: string): Promise<boolean> {
    await this.ensureLoaded();
    const normalized = normalizeText(description);
    const compact = compactText(description);

    return this.keywords.some((kw) => {
      const normalizedKeyword = normalizeText(kw);
      const compactKeyword = compactText(kw);
      return normalized.includes(normalizedKeyword) || compact.includes(compactKeyword);
    });
  }

  async refresh(): Promise<void> {
    this.loaded = false;
    await this.loadKeywords();
  }
}

export const recurringKeywordMatcher = new RecurringKeywordMatcher();
