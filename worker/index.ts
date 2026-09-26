import type { PDFDocument } from 'pdf-lib';
import { sql } from '@/lib/db';
import { storage, pagePath } from '@/lib/storage';
import { loadPdf, extractPage } from '@/lib/pdf';
import { ocrPage } from '@/lib/gemini';
import { indexPages } from '@/lib/indexing';

const MAX_PAGES = 1000;
const OCR_CONCURRENCY = 4;
const INDEX_BATCH = 50;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Doc = { id: string; storage_path: string };

/** Run `fn` over `items` with at most `n` in flight. */
async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: n }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item);
  }));
}

async function ocrOne(doc: Doc, src: PDFDocument, pageNo: number) {
  const bytes = await extractPage(src, pageNo - 1);
  const { error } = await storage().upload(pagePath(doc.id, pageNo), bytes, { contentType: 'application/pdf', upsert: true });
  if (error) throw error;
  let text = '';
  let failed = false;
  try {
    text = await ocrPage(bytes);
  } catch (e) {
    console.error(`OCR failed: doc ${doc.id} page ${pageNo}`, e);
    failed = true;
  }
  await sql`
    insert into pages (document_id, page_no, text, ocr_failed) values (${doc.id}, ${pageNo}, ${text}, ${failed})
    on conflict (document_id, page_no) do nothing`;
  await sql`update documents set pages_done = pages_done + 1, updated_at = now() where id = ${doc.id}`;
}

async function processDocument(doc: Doc) {
  const { data, error } = await storage().download(doc.storage_path);
  if (error) throw error;
  const src = await loadPdf(new Uint8Array(await data.arrayBuffer()));
  const count = src.getPageCount();
  if (count > MAX_PAGES) throw new Error(`PDF has ${count} pages; the limit is ${MAX_PAGES}`);

  const done = new Set((await sql<{ page_no: number }[]>`select page_no from pages where document_id = ${doc.id}`).map((r) => r.page_no));
  await sql`update documents set page_count = ${count}, pages_done = ${done.size}, updated_at = now() where id = ${doc.id}`;

  const all = Array.from({ length: count }, (_, i) => i + 1);
  await pool(all.filter((n) => !done.has(n)), OCR_CONCURRENCY, (n) => ocrOne(doc, src, n));

  for (let i = 0; i < all.length; i += INDEX_BATCH) {
    await indexPages(doc.id, all.slice(i, i + INDEX_BATCH));
    await sql`update documents set updated_at = now() where id = ${doc.id}`;
  }
  await sql`update documents set status = 'review', updated_at = now() where id = ${doc.id}`;
  console.log(`done: ${doc.id} (${count} pages)`);
}

async function main() {
  console.log('worker started');
  for (;;) {
    await sql`
      update documents set status = 'queued', updated_at = now()
      where status = 'processing' and updated_at < now() - interval '10 minutes'`;
    const [doc] = await sql<Doc[]>`
      update documents set status = 'processing', error = null, updated_at = now()
      where id = (select id from documents where status = 'queued' order by created_at limit 1 for update skip locked)
      returning id, storage_path`;
    if (!doc) {
      await sleep(5000);
      continue;
    }
    console.log(`processing ${doc.id}`);
    try {
      await processDocument(doc);
    } catch (e) {
      console.error(`failed ${doc.id}`, e);
      await sql`
        update documents set status = 'failed', error = ${e instanceof Error ? e.message : String(e)}, updated_at = now()
        where id = ${doc.id}`;
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
