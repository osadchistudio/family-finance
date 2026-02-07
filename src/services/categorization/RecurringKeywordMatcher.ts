import { prisma } from '@/lib/prisma';

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
    const normalized = this.normalize(description);
    return this.keywords.some(kw => normalized.includes(kw));
  }

  private normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\u0590-\u05FFa-z0-9\s]/g, '') // Keep Hebrew, alphanumeric, and spaces
      .replace(/\s+/g, ' ')
      .trim();
  }

  async refresh(): Promise<void> {
    this.loaded = false;
    await this.loadKeywords();
  }
}

export const recurringKeywordMatcher = new RecurringKeywordMatcher();
