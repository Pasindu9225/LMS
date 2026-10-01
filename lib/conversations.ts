import { sql } from '@/lib/db';
import { buildHistory, HISTORY_TURNS, type Turn } from '@/lib/text';

export type Source = { n: number; documentId: string; title: string; unitSi: string | null; unitEn: string | null; page: number };
/** One saved question/answer pair. A null source is a chunk deleted since (document re-indexed). */
export type StoredTurn = { question: string; answer: string; subjectId: string | null; sources: (Source | null)[] };
export type ConversationItem = { id: string; title: string; updatedAt: string };

type ChunkRef = { document_id: string; title: string; unit_si: string | null; unit_en: string | null; page_no: number };
export const toSource = (n: number, c: ChunkRef): Source =>
  ({ n, documentId: c.document_id, title: c.title, unitSi: c.unit_si, unitEn: c.unit_en, page: c.page_no });

export async function createConversation(userId: string, title: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into conversations (user_id, title) values (${userId}, ${title}) returning id`;
  return row.id;
}

export async function ownsConversation(userId: string, id: string): Promise<boolean> {
  const rows = await sql`select 1 from conversations where id = ${id} and user_id = ${userId}`;
  return rows.length > 0;
}

/** The conversation's last turns, oldest first, ready for the model. */
export async function getHistory(id: string): Promise<Turn[]> {
  const rows = await sql<Turn[]>`
    select question, answer from (
      select question, answer, created_at from chat_logs
      where conversation_id = ${id} order by created_at desc limit ${HISTORY_TURNS}
    ) t order by created_at`;
  return buildHistory([...rows]);
}

/** Logs one turn and bumps the conversation in a single statement (the CTE always runs). */
export function logTurn(t: {
  userId: string; subjectId: string; conversationId: string; question: string; answer: string; chunkIds: string[];
}) {
  return sql`
    with bump as (update conversations set updated_at = now() where id = ${t.conversationId})
    insert into chat_logs (user_id, subject_id, conversation_id, question, answer, chunk_ids)
    values (${t.userId}, ${t.subjectId}, ${t.conversationId}, ${t.question}, ${t.answer}, ${sql.array(t.chunkIds)}::uuid[])`;
}

export async function chatPageData(userId: string) {
  const [subjects, convs] = await Promise.all([
    sql<{ id: string; name_si: string; name_en: string }[]>`select id, name_si, name_en from subjects order by name_en`,
    sql<{ id: string; title: string; updated_at: Date }[]>`
      select id, title, updated_at from conversations
      where user_id = ${userId} order by updated_at desc limit 50`,
  ]);
  const conversations: ConversationItem[] = convs.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updated_at.toISOString() }));
  return { subjects: [...subjects], conversations };
}

/** All turns with sources rebuilt from chunk_ids. null = missing or not this user's; [] = theirs but empty. */
export async function getMessages(userId: string, id: string): Promise<StoredTurn[] | null> {
  if (!(await ownsConversation(userId, id))) return null;
  const rows = await sql<{ question: string; answer: string; subject_id: string | null; chunk_ids: string[] }[]>`
    select question, answer, subject_id, chunk_ids from chat_logs
    where conversation_id = ${id} order by created_at`;
  const ids = [...new Set(rows.flatMap((r) => r.chunk_ids))];
  const chunks = ids.length ? await sql<(ChunkRef & { id: string })[]>`
    select c.id, c.document_id, c.page_no, d.title, u.name_si as unit_si, u.name_en as unit_en
    from chunks c join documents d on d.id = c.document_id left join units u on u.id = c.unit_id
    where c.id = any(${sql.array(ids)}::uuid[])` : [];
  const byId = new Map(chunks.map((c) => [c.id, c]));
  return rows.map((r) => ({
    question: r.question,
    answer: r.answer,
    subjectId: r.subject_id,
    sources: r.chunk_ids.map((cid, i) => {
      const c = byId.get(cid);
      return c ? toSource(i + 1, c) : null;
    }),
  }));
}

export async function deleteConversation(userId: string, id: string) {
  await sql`delete from conversations where id = ${id} and user_id = ${userId}`;
}
