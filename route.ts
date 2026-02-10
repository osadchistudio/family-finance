import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';

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

    // Try to get API key from database first, then from env
    let anthropicKey: string | null = null;

    try {
      const setting = await prisma.setting.findUnique({
        where: { key: 'anthropic_api_key' },
      });
      if (setting) {
        try {
          anthropicKey = decrypt(setting.value);
        } catch (decryptError) {
          console.warn('Failed to decrypt API key from database:', decryptError);
          anthropicKey = null;
        }
      }
    } catch (error) {
      console.warn('Failed to fetch API key setting:', error);
    }

    // Fallback to environment variable
    if (!anthropicKey) {
      anthropicKey = process.env.ANTHROPIC_API_KEY || null;
      if (anthropicKey) {
        console.log('Using ANTHROPIC_API_KEY from environment variable');
      }
    }

    let categorizations: Record<string, string> = {};

    if (anthropicKey) {
      // Use Claude to identify businesses
      console.log('🔑 Using Claude API for categorization');
      console.log(`📝 Processing ${uniqueDescriptions.length} unique descriptions`);
      categorizations = await identifyWithClaude(
        uniqueDescriptions,
        categories,
        anthropicKey
      );
      console.log('✅ Claude returned:', JSON.stringify(categorizations, null, 2));
    } else {
      // Fallback: Use simple heuristics and web search patterns
      console.log('⚠️ No API key found, using heuristics');
      categorizations = await identifyWithHeuristics(uniqueDescriptions, categories);
    }

    // Apply categorizations
    let categorizedCount = 0;
    const keywordsToAdd: { categoryId: string; keyword: string }[] = [];

    for (const tx of uncategorizedTransactions) {
      const categoryName = categorizations[tx.description];
      if (categoryName) {
        const category = categories.find(c =>
          c.name === categoryName || c.nameEn?.toLowerCase() === categoryName.toLowerCase()
        );

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

/**
 * Use Claude API to identify business categories
 */
async function identifyWithClaude(
  descriptions: string[],
  categories: { name: string; nameEn: string | null }[],
  apiKey: string
): Promise<Record<string, string>> {
  const categoryList = categories.map(c => c.name).join(', ');

  const prompt = `אתה מומחה לזיהוי עסקים ישראליים וסיווגם לקטגוריות.

הקטגוריות הזמינות הן: ${categoryList}

עבור כל תיאור עסקה, זהה את העסק וסווג אותו לקטגוריה המתאימה ביותר.

הנחיות:
- "תספורת", "מספרה", "ספר" = טיפוח אישי (או בריאות אם אין טיפוח)
- חנות ספרים, ספרייה = חינוך
- מסעדות, קפה, אוכל מוכן = מסעדות וקפה
- סופרמרקט, מכולת = מכולת
- דלק, תדלוק = דלק (או תחבורה)
- נטפליקס, ספוטיפיי, אפליקציות = דיגיטל
- ביגוד, נעליים = ביגוד והנעלה

החזר תשובה בפורמט JSON בלבד, ללא הסברים.
תמיד נסה לסווג - עדיף לנחש קטגוריה קרובה מאשר לא לסווג בכלל.

תיאורי העסקאות:
${descriptions.map((d, i) => `${i + 1}. ${d}`).join('\n')}

החזר אובייקט JSON בפורמט:
{
  "תיאור העסקה המדויק כפי שמופיע למעלה": "שם הקטגוריה מהרשימה",
  ...
}

חשוב: השתמש בתיאור המדויק כ-key, לא במספר.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error('Claude API error:', await response.text());
      return {};
    }

    const data = await response.json();
    const content = data.content[0]?.text || '';

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return {};
  } catch (error) {
    console.error('Claude API call failed:', error);
    return {};
  }
}

/**
 * Fallback: Use heuristics to identify businesses
 */
async function identifyWithHeuristics(
  descriptions: string[],
  categories: { name: string; keywords: { keyword: string }[] }[]
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  // Known Israeli business patterns
  const businessPatterns: Record<string, string> = {
    // Clothing
    'זארה': 'ביגוד והנעלה',
    'zara': 'ביגוד והנעלה',
    'h&m': 'ביגוד והנעלה',
    'קסטרו': 'ביגוד והנעלה',
    'גולף': 'ביגוד והנעלה',
    'fox': 'ביגוד והנעלה',
    'נייק': 'ביגוד והנעלה',
    'אדידס': 'ביגוד והנעלה',
    'טרמינל': 'ביגוד והנעלה',
    'shein': 'ביגוד והנעלה',

    // Groceries
    'שופרסל': 'מכולת',
    'רמי לוי': 'מכולת',
    'מגה': 'מכולת',
    'ויקטורי': 'מכולת',

    // Restaurants
    'מקדונלדס': 'מסעדות וקפה',
    'ארומה': 'מסעדות וקפה',
    'קפה': 'מסעדות וקפה',
    'בורגר': 'מסעדות וקפה',
    'פיצה': 'מסעדות וקפה',

    // Transportation
    'דלק': 'תחבורה',
    'סונול': 'תחבורה',
    'פז': 'תחבורה',
    'יאנגו': 'תחבורה',
    'גט': 'תחבורה',

    // Health
    'סופר פארם': 'בריאות',
    'מכבי': 'בריאות',
    'כללית': 'בריאות',

    // Electronics
    'ksp': 'קניות כלליות',
    'באג': 'קניות כלליות',
    'איקאה': 'קניות כלליות',
  };

  for (const desc of descriptions) {
    const lowerDesc = desc.toLowerCase();

    // Check patterns
    for (const [pattern, category] of Object.entries(businessPatterns)) {
      if (lowerDesc.includes(pattern.toLowerCase())) {
        result[desc] = category;
        break;
      }
    }

    // If not found in patterns, check existing keywords
    if (!result[desc]) {
      for (const cat of categories) {
        for (const kw of cat.keywords) {
          if (lowerDesc.includes(kw.keyword.toLowerCase())) {
            result[desc] = cat.name;
            break;
          }
        }
        if (result[desc]) break;
      }
    }
  }

  return result;
}

/**
 * Extract keyword from description
 */
function extractKeyword(description: string): string | null {
  const cleanDesc = description
    .replace(/[0-9]/g, '')
    .replace(/[-_]/g, ' ')
    .trim();

  const words = cleanDesc.split(/\s+/).filter(w => w.length > 2);

  if (words.length === 0) return null;

  if (words.length >= 2) {
    return words.slice(0, 2).join(' ');
  }

  return words[0];
}
