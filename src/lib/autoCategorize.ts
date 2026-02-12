import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';

export interface AutoCategorizeCategory {
  id: string;
  name: string;
  nameEn: string | null;
  icon: string | null;
  color: string | null;
  keywords: { keyword: string }[];
}

export interface IdentifyDescriptionsOptions {
  // When false, do not map using existing learned keywords (safer for re-check of single row).
  includeKeywordFallback?: boolean;
}

export async function resolveAnthropicApiKey(): Promise<string | null> {
  let anthropicKey: string | null = null;

  try {
    const setting = await prisma.setting.findUnique({
      where: { key: 'anthropic_api_key' },
    });
    if (setting) {
      anthropicKey = decrypt(setting.value);
    }
  } catch {
    // If decryption fails, fallback to env variable
  }

  if (!anthropicKey) {
    anthropicKey = process.env.ANTHROPIC_API_KEY || null;
  }

  return anthropicKey;
}

export async function identifyDescriptions(
  descriptions: string[],
  categories: AutoCategorizeCategory[],
  apiKey: string | null,
  options: IdentifyDescriptionsOptions = {}
): Promise<Record<string, string>> {
  if (descriptions.length === 0) return {};
  const { includeKeywordFallback = true } = options;

  if (apiKey) {
    return identifyWithClaude(descriptions, categories, apiKey);
  }

  return identifyWithHeuristics(descriptions, categories, includeKeywordFallback);
}

export function findCategoryByName(
  categories: AutoCategorizeCategory[],
  categoryName: string
): AutoCategorizeCategory | undefined {
  const lower = categoryName.toLowerCase();
  return categories.find(c =>
    c.name === categoryName || c.nameEn?.toLowerCase() === lower
  );
}

export function extractKeyword(description: string): string | null {
  const cleanDesc = description
    .replace(/[0-9]/g, '')
    .replace(/[-_]/g, ' ')
    .trim();

  const words = cleanDesc.split(/\s+/).filter(w => w.length > 2);

  if (words.length === 0) return null;
  if (words.length >= 2) return words.slice(0, 2).join(' ');
  return words[0];
}

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
- "תמנון" = ביגוד והנעלה
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
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Claude API call failed:', error);
    return {};
  }
}

async function identifyWithHeuristics(
  descriptions: string[],
  categories: { name: string; keywords: { keyword: string }[] }[],
  includeKeywordFallback: boolean
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  const businessPatterns: Record<string, string> = {
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
    'תמנון': 'ביגוד והנעלה',
    'tamnun': 'ביגוד והנעלה',
    'שופרסל': 'מכולת',
    'רמי לוי': 'מכולת',
    'מגה': 'מכולת',
    'ויקטורי': 'מכולת',
    'מקדונלדס': 'מסעדות וקפה',
    'ארומה': 'מסעדות וקפה',
    'קפה': 'מסעדות וקפה',
    'בורגר': 'מסעדות וקפה',
    'פיצה': 'מסעדות וקפה',
    'דלק': 'תחבורה',
    'סונול': 'תחבורה',
    'פז': 'תחבורה',
    'יאנגו': 'תחבורה',
    'גט': 'תחבורה',
    'סופר פארם': 'בריאות',
    'מכבי': 'בריאות',
    'כללית': 'בריאות',
    'ksp': 'קניות כלליות',
    'באג': 'קניות כלליות',
    'איקאה': 'קניות כלליות',
  };

  for (const desc of descriptions) {
    const lowerDesc = desc.toLowerCase();

    for (const [pattern, category] of Object.entries(businessPatterns)) {
      if (lowerDesc.includes(pattern.toLowerCase())) {
        result[desc] = category;
        break;
      }
    }

    if (!result[desc] && includeKeywordFallback) {
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
