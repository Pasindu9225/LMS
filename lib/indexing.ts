import { sql, toVector } from '@/lib/db';
import { chunkPage } from '@/lib/text';
import { embed } from '@/lib/gemini';

/** Re-chunk and re-embed the given pages, replacing their existing chunks. */
export async function indexPages(documentId: string, pageNos: number[]) {
  if (!pageNos.length) return;
  const pages = await sql<{
    page_no: number; text: string; unit_id: string | null; title: string;
    subject_id: string; unit_si: string | null; unit_en: string | null;
  }[]>`
    select p.page_no, p.text, p.unit_id, d.title, d.subject_id, u.name_si as unit_si, u.name_en as unit_en
    from pages p
    join documents d on d.id = p.document_id
    left join units u on u.id = p.unit_id
    where p.document_id = ${documentId} and p.page_no = any(${sql.array(pageNos)}::int[])`;

  const rows = pages.flatMap((p) => chunkPage(p.text).map((content) => ({ ...p, content })));
  // Title + unit names (both languages) in the embedded text improve retrieval; stored content stays plain.
  const vectors = await embed(
    rows.map((r) => `${r.title} · ${[r.unit_si, r.unit_en].filter(Boolean).join(' / ')}\n${r.content}`),
    'RETRIEVAL_DOCUMENT',
  );

  await sql.begin(async (tx) => {
    await tx`delete from chunks where document_id = ${documentId} and page_no = any(${sql.array(pageNos)}::int[])`;
    await Promise.all(rows.map((r, i) => tx`
      insert into chunks (document_id, subject_id, unit_id, page_no, content, embedding)
      values (${documentId}, ${r.subject_id}, ${r.unit_id}, ${r.page_no}, ${r.content}, ${toVector(vectors[i])}::vector)`));
  });
}
