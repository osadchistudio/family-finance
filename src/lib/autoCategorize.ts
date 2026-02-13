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

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/["'`׳״]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeForMatch(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function parseAiCategorization(content: string): Record<string, string> {
  const cleaned = content
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  const tryParse = (candidate: string): Record<string, string> | null => {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof key === 'string' && typeof value === 'string' && key.trim() && value.trim()) {
          normalized[key.trim()] = value.trim();
        }
      }

      return normalized;
    } catch {
      return null;
    }
  };

  const direct = tryParse(cleaned);
  if (direct) return direct;

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return {};

  const matched = jsonMatch[0];
  const parsedMatch = tryParse(matched);
  if (parsedMatch) return parsedMatch;

  // Try once more after replacing smart quotes.
  const normalizedQuotes = matched
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");

  return tryParse(normalizedQuotes) || {};
}

function findCategoryNameByAliases(
  categories: { name: string; nameEn?: string | null }[],
  aliases: string[]
): string | null {
  const normalizedAliases = aliases
    .map(normalizeForMatch)
    .filter(Boolean);

  for (const alias of normalizedAliases) {
    for (const category of categories) {
      const names = [category.name, category.nameEn || '']
        .map(normalizeForMatch)
        .filter(Boolean);

      if (names.some((name) => name === alias)) return category.name;
      if (names.some((name) => name.includes(alias) || alias.includes(name))) return category.name;
    }
  }

  return null;
}

export function resolveCategoryForDescription(
  categorizations: Record<string, string>,
  description: string
): string | null {
  if (categorizations[description]) {
    return String(categorizations[description]).trim() || null;
  }

  const trimmedDescription = description.trim();
  if (categorizations[trimmedDescription]) {
    return String(categorizations[trimmedDescription]).trim() || null;
  }

  const normalizedDescription = normalizeForMatch(description);
  if (!normalizedDescription) return null;

  const normalizedMap = new Map<string, string>();
  for (const [key, value] of Object.entries(categorizations)) {
    if (!value || typeof value !== 'string') continue;
    const normalizedKey = normalizeForMatch(key);
    if (!normalizedKey) continue;
    if (!normalizedMap.has(normalizedKey)) {
      normalizedMap.set(normalizedKey, value.trim());
    }
  }

  if (normalizedMap.has(normalizedDescription)) {
    return normalizedMap.get(normalizedDescription) || null;
  }

  let bestValue: string | null = null;
  let bestScore = 0;

  for (const [normalizedKey, value] of normalizedMap.entries()) {
    if (!normalizedKey) continue;

    let score = 0;
    if (normalizedKey.includes(normalizedDescription) || normalizedDescription.includes(normalizedKey)) {
      score = Math.min(normalizedKey.length, normalizedDescription.length)
        / Math.max(normalizedKey.length, normalizedDescription.length);
    }

    const sourceTokens = tokenize(normalizedKey);
    const targetTokens = tokenize(normalizedDescription);
    if (sourceTokens.length > 0 && targetTokens.length > 0) {
      const sourceSet = new Set(sourceTokens);
      const overlap = targetTokens.filter((token) => sourceSet.has(token)).length;
      const tokenScore = overlap / Math.max(sourceTokens.length, targetTokens.length);
      score = Math.max(score, tokenScore);
    }

    if (score > bestScore) {
      bestScore = score;
      bestValue = value;
    }
  }

  if (bestScore >= 0.6) {
    return bestValue;
  }

  return null;
}

export async function resolveOpenAiApiKey(): Promise<string | null> {
  let openaiKey: string | null = null;

  try {
    const setting = await prisma.setting.findUnique({
      where: { key: 'openai_api_key' },
    });
    if (setting) {
      openaiKey = decrypt(setting.value);
    }
  } catch {
    // If decryption fails, fallback to env variable
  }

  if (!openaiKey) {
    openaiKey = process.env.OPENAI_API_KEY || null;
  }

  return openaiKey;
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
    const aiResult = await identifyWithOpenAI(descriptions, categories, apiKey);
    if (Object.keys(aiResult).length > 0) {
      return aiResult;
    }
  }

  return identifyWithHeuristics(descriptions, categories, includeKeywordFallback);
}

export function findCategoryByName(
  categories: AutoCategorizeCategory[],
  categoryName: string
): AutoCategorizeCategory | undefined {
  if (!categoryName?.trim()) return undefined;

  const normalizedTarget = normalizeForMatch(categoryName);
  const lower = categoryName.toLowerCase();
  const direct = categories.find(c =>
    c.name === categoryName || c.nameEn?.toLowerCase() === lower
  );
  if (direct) return direct;

  const normalizedExact = categories.find((category) => {
    const names = [category.name, category.nameEn || '']
      .map(normalizeForMatch)
      .filter(Boolean);
    return names.includes(normalizedTarget);
  });
  if (normalizedExact) return normalizedExact;

  const normalizedContains = categories.find((category) => {
    const names = [category.name, category.nameEn || '']
      .map(normalizeForMatch)
      .filter(Boolean);
    return names.some((name) => name.includes(normalizedTarget) || normalizedTarget.includes(name));
  });
  if (normalizedContains) return normalizedContains;

  const targetTokens = tokenize(categoryName);
  if (targetTokens.length === 0) return undefined;

  let bestMatch: AutoCategorizeCategory | undefined;
  let bestScore = 0;

  for (const category of categories) {
    const categoryTokens = tokenize(`${category.name} ${category.nameEn || ''}`);
    if (categoryTokens.length === 0) continue;

    const categorySet = new Set(categoryTokens);
    const overlap = targetTokens.filter((token) => categorySet.has(token)).length;
    const score = overlap / Math.max(targetTokens.length, categoryTokens.length);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = category;
    }
  }

  return bestScore >= 0.4 ? bestMatch : undefined;
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

async function identifyWithOpenAI(
  descriptions: string[],
  categories: { name: string; nameEn: string | null }[],
  apiKey: string
): Promise<Record<string, string>> {
  const categoryList = categories.map(c => c.name).join(', ');
  const model = process.env.OPENAI_MODEL || 'gpt-5-mini';

  const prompt = `אתה מומחה לזיהוי עסקים בישראל וסיווגם לקטגוריות.

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

חשוב: השתמש בתיאור המדויק כ-key, לא במספר.
אם אינך בטוח, בחר את הקטגוריה הקרובה ביותר מהרשימה.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'ענה רק בפורמט JSON תקין.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error('OpenAI API error:', await response.text());
      return {};
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '';
    if (typeof content !== 'string') return {};

    return parseAiCategorization(content);
  } catch (error) {
    console.error('OpenAI API call failed:', error);
    return {};
  }
}

async function identifyWithHeuristics(
  descriptions: string[],
  categories: { name: string; nameEn?: string | null; keywords: { keyword: string }[] }[],
  includeKeywordFallback: boolean
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  const businessPatterns: Record<string, string[]> = {
    'זארה': ['ביגוד והנעלה', 'ביגוד', 'אופנה', 'בגדים'],
    'zara': ['ביגוד והנעלה', 'ביגוד', 'אופנה', 'בגדים'],
    'h&m': ['ביגוד והנעלה', 'ביגוד', 'אופנה', 'בגדים'],
    'קסטרו': ['ביגוד והנעלה', 'ביגוד', 'אופנה', 'בגדים'],
    'גולף': ['ביגוד והנעלה', 'ביגוד', 'אופנה', 'בגדים'],
    'fox': ['ביגוד והנעלה', 'ביגוד', 'אופנה', 'בגדים'],
    'נייק': ['ביגוד והנעלה', 'ביגוד', 'אופנה', 'בגדים'],
    'אדידס': ['ביגוד והנעלה', 'ביגוד', 'אופנה', 'בגדים'],
    'טרמינל': ['ביגוד והנעלה', 'ביגוד', 'אופנה', 'בגדים'],
    'shein': ['ביגוד והנעלה', 'ביגוד', 'אופנה', 'בגדים'],
    'תמנון': ['ביגוד והנעלה', 'ביגוד', 'אופנה', 'בגדים'],
    'tamnun': ['ביגוד והנעלה', 'ביגוד', 'אופנה', 'בגדים'],
    'שופרסל': ['מכולת', 'סופר', 'מזון', 'קניות'],
    'רמי לוי': ['מכולת', 'סופר', 'מזון', 'קניות'],
    'מגה': ['מכולת', 'סופר', 'מזון', 'קניות'],
    'ויקטורי': ['מכולת', 'סופר', 'מזון', 'קניות'],
    'מקדונלדס': ['מסעדות וקפה', 'מסעדות', 'אוכל', 'בילוי'],
    'ארומה': ['מסעדות וקפה', 'מסעדות', 'קפה', 'אוכל'],
    'קפה': ['מסעדות וקפה', 'מסעדות', 'קפה', 'אוכל'],
    'בורגר': ['מסעדות וקפה', 'מסעדות', 'אוכל'],
    'פיצה': ['מסעדות וקפה', 'מסעדות', 'אוכל'],
    'דלק': ['תחבורה', 'רכב', 'דלק'],
    'סונול': ['תחבורה', 'רכב', 'דלק'],
    'פז': ['תחבורה', 'רכב', 'דלק'],
    'יאנגו': ['תחבורה', 'רכב', 'נסיעות'],
    'גט': ['תחבורה', 'רכב', 'נסיעות'],
    'סופר פארם': ['בריאות', 'טיפוח אישי', 'פארם'],
    'מכבי': ['בריאות', 'רפואה'],
    'כללית': ['בריאות', 'רפואה'],
    'ksp': ['קניות כלליות', 'קניות', 'טכנולוגיה', 'מחשבים'],
    'באג': ['קניות כלליות', 'קניות', 'טכנולוגיה', 'מחשבים'],
    'איקאה': ['קניות כלליות', 'בית', 'ריהוט'],
  };

  for (const desc of descriptions) {
    const lowerDesc = desc.toLowerCase();

    for (const [pattern, aliases] of Object.entries(businessPatterns)) {
      if (lowerDesc.includes(pattern.toLowerCase())) {
        const matchedCategory = findCategoryNameByAliases(categories, aliases);
        if (matchedCategory) {
          result[desc] = matchedCategory;
        }
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
