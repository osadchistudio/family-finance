import { extractMerchantSignature } from '@/lib/merchantSimilarity';

/**
 * Extract the most meaningful keyword from a transaction description.
 * Used for both category learning and recurring expense detection.
 */
export function extractKeyword(description: string): string | null {
  return extractMerchantSignature(description);
}
