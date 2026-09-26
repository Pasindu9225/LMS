import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { loadPdf, extractPage } from '@/lib/pdf';
import { ocrPage } from '@/lib/gemini';

async function main() {
  const [file, ...pageArgs] = process.argv.slice(2);
  if (!file || !pageArgs.length) {
    console.error('Usage: npm run ocr-test -- <file.pdf> <page> [page...]   (pages are 1-based)');
    process.exit(1);
  }
  const src = await loadPdf(await readFile(file));
  await mkdir('out', { recursive: true });
  for (const p of pageArgs.map(Number)) {
    const started = Date.now();
    const text = await ocrPage(await extractPage(src, p - 1));
    const out = `out/ocr-page-${p}.md`;
    await writeFile(out, text);
    console.log(`page ${p}: ${text.length} chars in ${Date.now() - started} ms → ${out}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
