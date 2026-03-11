const GENERIC_TOKENS = new Set([
  'העברה', 'העברות', 'חיוב', 'זיכוי', 'תשלום', 'תשלומים', 'עסקה', 'עסקאות',
  'עמלה', 'עמלות', 'משיכה', 'הפקדה', 'אשראי', 'כרטיס', 'ויזה', 'מאסטרקארד',
  'mastercard', 'visa', 'direct', 'debit', 'credit', 'bit', 'ביט', 'paybox',
  'פייבוקס', 'pepper', 'פפר', 'bank', 'בנק', 'הפועלים', 'לאומי', 'ישראכרט',
  'מסטרקארד', 'cal', 'max', 'הוראת', 'קבע', 'העב', 'חיובים'
]);

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u0591-\u05C7]/g, '') // remove Hebrew niqqud/marks
    .replace(/["'`׳״]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getMerchantTokens(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .map(token => token.trim())
    .filter(token => token.length > 1)
    .filter(token => !/^\d+$/.test(token))
    .filter(token => !GENERIC_TOKENS.has(token));
}

export function compactText(value: string): string {
  return normalizeText(value).replace(/\s+/g, '');
}

function diceCoefficient(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) {
    return left === right ? 1 : 0;
  }

  const pairs = new Map<string, number>();
  for (let index = 0; index < left.length - 1; index++) {
    const pair = left.slice(index, index + 2);
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
  }

  let intersection = 0;
  for (let index = 0; index < right.length - 1; index++) {
    const pair = right.slice(index, index + 2);
    const count = pairs.get(pair) ?? 0;
    if (count > 0) {
      intersection++;
      pairs.set(pair, count - 1);
    }
  }

  return (2 * intersection) / ((left.length - 1) + (right.length - 1));
}

export function extractMerchantSignature(description: string): string | null {
  const tokens = getMerchantTokens(description);
  if (tokens.length === 0) return null;

  const first = tokens[0];
  const second = tokens[1];

  // Keep short two-word brands (e.g. "רי בר") together.
  if (first.length <= 2 && second) {
    return `${first} ${second}`;
  }

  return first;
}

export function merchantSimilarityScore(sourceDescription: string, candidateDescription: string): number {
  const sourceNormalized = normalizeText(sourceDescription);
  const candidateNormalized = normalizeText(candidateDescription);

  if (!sourceNormalized || !candidateNormalized) return 0;
  if (sourceNormalized === candidateNormalized) return 1;

  const sourceCompact = compactText(sourceDescription);
  const candidateCompact = compactText(candidateDescription);
  if (!sourceCompact || !candidateCompact) return 0;
  if (sourceCompact === candidateCompact) return 1;

  const sourceSignature = extractMerchantSignature(sourceDescription);
  const candidateSignature = extractMerchantSignature(candidateDescription);
  if (sourceSignature && candidateSignature) {
    if (sourceSignature === candidateSignature) return 0.98;
    if (compactText(sourceSignature) === compactText(candidateSignature)) return 0.97;
  }

  const compactDice = diceCoefficient(sourceCompact, candidateCompact);
  if (
    compactDice >= 0.92 &&
    Math.abs(sourceCompact.length - candidateCompact.length) <= 2
  ) {
    return compactDice;
  }

  const sourceTokens = getMerchantTokens(sourceDescription);
  const candidateTokens = getMerchantTokens(candidateDescription);
  if (sourceTokens.length > 0 && candidateTokens.length > 0) {
    const sourceSet = new Set(sourceTokens);
    const overlap = candidateTokens.filter(token => sourceSet.has(token)).length;
    const overlapRatio = overlap / Math.max(sourceTokens.length, candidateTokens.length);
    return Math.max(compactDice, overlapRatio);
  }

  return compactDice;
}

export function isLikelySameMerchant(sourceDescription: string, candidateDescription: string): boolean {
  return merchantSimilarityScore(sourceDescription, candidateDescription) >= 0.84;
}
