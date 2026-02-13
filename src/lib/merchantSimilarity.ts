const GENERIC_TOKENS = new Set([
  'העברה', 'העברות', 'חיוב', 'זיכוי', 'תשלום', 'תשלומים', 'עסקה', 'עסקאות',
  'עמלה', 'עמלות', 'משיכה', 'הפקדה', 'אשראי', 'כרטיס', 'ויזה', 'מאסטרקארד',
  'mastercard', 'visa', 'direct', 'debit', 'credit', 'bit', 'ביט', 'paybox',
  'פייבוקס', 'pepper', 'פפר', 'bank', 'בנק', 'הפועלים', 'לאומי', 'ישראכרט',
  'מסטרקארד', 'cal', 'max', 'הוראת', 'קבע', 'העב', 'חיובים'
]);

function normalizeText(value: string): string {
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

function compact(value: string): string {
  return normalizeText(value).replace(/\s+/g, '');
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

export function isLikelySameMerchant(sourceDescription: string, candidateDescription: string): boolean {
  const sourceNormalized = normalizeText(sourceDescription);
  const candidateNormalized = normalizeText(candidateDescription);

  if (!sourceNormalized || !candidateNormalized) return false;
  if (sourceNormalized === candidateNormalized) return true;

  const sourceSignature = extractMerchantSignature(sourceDescription);
  const candidateSignature = extractMerchantSignature(candidateDescription);

  if (sourceSignature && candidateSignature) {
    if (sourceSignature === candidateSignature) return true;
    if (compact(sourceSignature) === compact(candidateSignature)) return true;
  }

  if (sourceSignature && sourceSignature.length >= 3) {
    if (candidateNormalized.startsWith(`${sourceSignature} `) || candidateNormalized.includes(` ${sourceSignature} `)) {
      return true;
    }
  }

  if (candidateSignature && candidateSignature.length >= 3) {
    if (sourceNormalized.startsWith(`${candidateSignature} `) || sourceNormalized.includes(` ${candidateSignature} `)) {
      return true;
    }
  }

  const sourceTokens = getMerchantTokens(sourceDescription);
  const candidateTokens = getMerchantTokens(candidateDescription);
  if (sourceTokens.length === 0 || candidateTokens.length === 0) return false;

  if (sourceTokens[0] === candidateTokens[0] && sourceTokens[0].length >= 3) {
    return true;
  }

  const sourceSet = new Set(sourceTokens);
  const overlap = candidateTokens.filter(token => sourceSet.has(token)).length;
  const overlapRatio = overlap / Math.max(sourceTokens.length, candidateTokens.length);

  return overlapRatio >= 0.6;
}
