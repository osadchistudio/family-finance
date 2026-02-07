/**
 * Extract the most meaningful keyword from a transaction description.
 * Used for both category learning and recurring expense detection.
 */
export function extractKeyword(description: string): string | null {
  // Remove common words and extract the business name
  const cleanDesc = description
    .replace(/[0-9]/g, '') // Remove numbers
    .replace(/[-_]/g, ' ') // Replace separators with spaces
    .trim();

  // Split into words and find the longest meaningful one
  const words = cleanDesc.split(/\s+/).filter(w => w.length > 2);

  if (words.length === 0) return null;

  // Return first 2 words combined or the longest word
  if (words.length >= 2) {
    return words.slice(0, 2).join(' ');
  }

  return words[0];
}
