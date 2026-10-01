import { sql, toVector } from '@/lib/db';
import { embed, rewriteQuestion } from '@/lib/gemini';
import { mergeResults, type Turn } from '@/lib/text';

const TOP_K = 8;

export type Hit = {
  id: string; document_id: string; page_no: number; content: string; title: string;
  unit_si: string | null; unit_en: string | null; similarity: number;
};

function search(subjectId: string, v: number[]) {
  const vec = toVector(v);
  return sql<Hit[]>`
    select c.id, c.document_id, c.page_no, c.content, d.title, u.name_si as unit_si, u.name_en as unit_en,
           1 - (c.embedding <=> ${vec}::vector) as similarity
    from chunks c
    join documents d on d.id = c.document_id
    left join units u on u.id = c.unit_id
    where c.subject_id = ${subjectId} and d.status = 'live'
    order by c.embedding <=> ${vec}::vector
    limit ${TOP_K}`;
}

/** Rewrite (si + en, resolving references against history), embed both, search the subject's live docs, merge. Not threshold-filtered. */
export async function retrieve(subjectId: string, question: string, history: Turn[] = []) {
  const r = await rewriteQuestion(question, history);
  const [vSi, vEn] = await embed([r.query_si, r.query_en], 'RETRIEVAL_QUERY');
  const [a, b] = await Promise.all([search(subjectId, vSi), search(subjectId, vEn)]);
  return { replyLang: r.reply_lang === 'en' ? 'en' as const : 'si' as const, hits: mergeResults([[...a], [...b]], TOP_K) };
}

export const buildUserMessage = (hits: Hit[], question: string) =>
  `<sources>\n${hits
    .map((h, i) => `[${i + 1}] ${h.title} · ${h.unit_si ?? h.unit_en ?? '-'} · page ${h.page_no}\n${h.content}`)
    .join('\n\n---\n\n')}\n</sources>\n\nQuestion: ${question}`;
