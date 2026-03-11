import { extractText } from 'unpdf';

export async function extractPdfPages(buffer: Buffer): Promise<string[]> {
  const { text } = await extractText(new Uint8Array(buffer));
  return (Array.isArray(text) ? text : [text]).map(page => String(page ?? ''));
}

type PdfParseResult = {
  text?: string;
};

export async function extractPdfPagesWithPdfParse(buffer: Buffer): Promise<string[]> {
  const pdfParse = require('pdf-parse') as (input: Buffer) => Promise<PdfParseResult>;
  const { text } = await pdfParse(buffer);
  const normalizedText = String(text ?? '');
  const pages = normalizedText
    .split(/\f/)
    .map(page => page.trim())
    .filter(Boolean);

  return pages.length > 0 ? pages : [normalizedText];
}
