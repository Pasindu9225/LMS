import { PDFDocument } from 'pdf-lib';

export const loadPdf = (bytes: Uint8Array) => PDFDocument.load(bytes, { ignoreEncryption: true });

/** Returns page `index` (0-based) as a standalone 1-page PDF. */
export async function extractPage(src: PDFDocument, index: number): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const [page] = await out.copyPages(src, [index]);
  out.addPage(page);
  return out.save();
}
