import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { buildMerchantFamilyKey, merchantSimilarityScore, normalizeText } from '../src/lib/merchantSimilarity';

type AuditTransaction = {
  id: string;
  description: string;
  merchantName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  amount: string;
  isExcluded: boolean;
};

type MerchantGroup = {
  key: string;
  displayName: string;
  sampleDescriptions: string[];
  categorized: AuditTransaction[];
  uncategorized: AuditTransaction[];
  categories: Map<string, { name: string; count: number }>;
};

function chooseDisplayName(group: MerchantGroup): string {
  const names = [group.displayName, ...group.sampleDescriptions]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  return names[0] || group.displayName;
}

function formatCategoryBreakdown(group: MerchantGroup): string {
  return [...group.categories.values()]
    .sort((left, right) => right.count - left.count)
    .map((entry) => `${entry.name}:${entry.count}`)
    .join(', ');
}

async function main() {
  const transactions = await prisma.transaction.findMany({
    where: {
      isExcluded: false,
    },
    select: {
      id: true,
      description: true,
      merchantName: true,
      categoryId: true,
      amount: true,
      isExcluded: true,
      category: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });

  const auditTransactions: AuditTransaction[] = transactions.map((tx) => ({
    id: tx.id,
    description: tx.description,
    merchantName: tx.merchantName,
    categoryId: tx.categoryId,
    categoryName: tx.category?.name ?? null,
    amount: tx.amount.toString(),
    isExcluded: tx.isExcluded,
  }));

  const groups = new Map<string, MerchantGroup>();

  for (const tx of auditTransactions) {
    const familyKey = buildMerchantFamilyKey(tx.merchantName || tx.description);
    if (!familyKey) continue;

    const existing = groups.get(familyKey) ?? {
      key: familyKey,
      displayName: tx.merchantName || tx.description,
      sampleDescriptions: [],
      categorized: [],
      uncategorized: [],
      categories: new Map<string, { name: string; count: number }>(),
    };

    if (existing.sampleDescriptions.length < 3 && !existing.sampleDescriptions.includes(tx.description)) {
      existing.sampleDescriptions.push(tx.description);
    }

    if (tx.categoryId && tx.categoryName) {
      existing.categorized.push(tx);
      const categoryEntry = existing.categories.get(tx.categoryId) ?? {
        name: tx.categoryName,
        count: 0,
      };
      categoryEntry.count += 1;
      existing.categories.set(tx.categoryId, categoryEntry);
    } else {
      existing.uncategorized.push(tx);
    }

    groups.set(familyKey, existing);
  }

  const rankedGroups = [...groups.values()]
    .map((group) => {
      const rankedCategories = [...group.categories.entries()]
        .map(([categoryId, value]) => ({
          categoryId,
          categoryName: value.name,
          count: value.count,
        }))
        .sort((left, right) => right.count - left.count);

      const top = rankedCategories[0];
      const second = rankedCategories[1];
      const categorizedCount = group.categorized.length;
      const uncategorizedCount = group.uncategorized.length;
      const dominance = top && categorizedCount > 0 ? top.count / categorizedCount : 0;
      return {
        group,
        displayName: chooseDisplayName(group),
        categorizedCount,
        uncategorizedCount,
        top,
        second,
        dominance,
      };
    })
    .filter((item) => item.categorizedCount > 0)
    .sort((left, right) => right.categorizedCount - left.categorizedCount);

  const ambiguousGroups = rankedGroups
    .filter((item) => item.second && item.top && item.dominance < 0.75 && item.categorizedCount >= 3)
    .slice(0, 20);

  const strongHistoryWithUncategorized = rankedGroups
    .filter((item) => item.top && item.uncategorizedCount > 0 && item.categorizedCount >= 3 && item.dominance >= 0.8)
    .slice(0, 20);

  const likelyMisses: Array<{
    description: string;
    displayName: string;
    predictedCategory: string;
    confidence: number;
    bestMatchDescription: string;
    similarityScore: number;
  }> = [];

  for (const item of strongHistoryWithUncategorized) {
    if (!item.top) continue;

    const reference = item.group.categorized[0];
    if (!reference) continue;

    for (const uncategorized of item.group.uncategorized.slice(0, 3)) {
      const similarityScore = merchantSimilarityScore(
        uncategorized.description,
        reference.merchantName || reference.description
      );

      likelyMisses.push({
        description: uncategorized.description,
        displayName: item.displayName,
        predictedCategory: item.top.categoryName,
        confidence: Number(item.dominance.toFixed(2)),
        bestMatchDescription: reference.description,
        similarityScore: Number(similarityScore.toFixed(2)),
      });
    }
  }

  console.log('=== Merchant Categorization Audit ===');
  console.log(`Total transactions: ${auditTransactions.length}`);
  console.log(`Merchant families with categorized history: ${rankedGroups.length}`);
  console.log('');

  console.log('--- Ambiguous merchant families (possible noise / wrong learning) ---');
  if (ambiguousGroups.length === 0) {
    console.log('None found');
  } else {
    for (const item of ambiguousGroups) {
      console.log([
        item.displayName,
        `categorized=${item.categorizedCount}`,
        `uncategorized=${item.uncategorizedCount}`,
        `dominance=${item.dominance.toFixed(2)}`,
        `top=${item.top?.categoryName ?? 'n/a'}`,
        `second=${item.second?.categoryName ?? 'n/a'}`,
        `breakdown=${formatCategoryBreakdown(item.group)}`,
        `samples=${item.group.sampleDescriptions.join(' | ')}`,
      ].join(' || '));
    }
  }
  console.log('');

  console.log('--- Strong-history families with uncategorized transactions (likely missed inheritance) ---');
  if (strongHistoryWithUncategorized.length === 0) {
    console.log('None found');
  } else {
    for (const item of strongHistoryWithUncategorized) {
      console.log([
        item.displayName,
        `categorized=${item.categorizedCount}`,
        `uncategorized=${item.uncategorizedCount}`,
        `dominance=${item.dominance.toFixed(2)}`,
        `predicted=${item.top?.categoryName ?? 'n/a'}`,
        `breakdown=${formatCategoryBreakdown(item.group)}`,
        `samples=${item.group.sampleDescriptions.join(' | ')}`,
      ].join(' || '));
    }
  }
  console.log('');

  console.log('--- Example uncategorized transactions that should probably inherit from history ---');
  if (likelyMisses.length === 0) {
    console.log('None found');
  } else {
    for (const miss of likelyMisses.slice(0, 25)) {
      console.log([
        miss.displayName,
        `tx="${miss.description}"`,
        `predicted=${miss.predictedCategory}`,
        `dominance=${miss.confidence.toFixed(2)}`,
        `similarity=${miss.similarityScore.toFixed(2)}`,
        `reference="${miss.bestMatchDescription}"`,
      ].join(' || '));
    }
  }
}

main()
  .catch((error) => {
    console.error('Merchant categorization audit failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
