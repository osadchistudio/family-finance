import { extractText } from 'unpdf';

export async function extractPdfPages(buffer: Buffer): Promise<string[]> {
  const { text } = await extractText(new Uint8Array(buffer));
  return (Array.isArray(text) ? text : [text]).map(page => String(page ?? ''));
}
