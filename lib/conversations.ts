import { sql, asUser } from '@/lib/db';
import { buildHistory, HISTORY_TURNS, type Turn, type FlagStatus } from '@/lib/text';

export type Source = { n: number; documentId: string; title: string; unitSi: string | null; unitEn: string | null; page: number };
/** One saved question/answer pair. A null source is a chunk deleted since (document re-indexed). */
export type StoredTurn = {
  id: string; question: string; answer: string; subjectId: string | null; sources: (Source | null)[];
  flagStatus: FlagStatus | null; reply: string | null; repliedAt: string | null;
};
export type ConversationItem = { id: string; title: string; updatedAt: string; hasNewReply: boolean };

type ChunkRef = { document_id: string; title: string; unit_si: string | null; unit_en: string | null; page_no: number };
export const toSource = (n: number, c: ChunkRef): Source =>
  ({ n, documentId: c.document_id, title: c.title, unitSi: c.unit_si, unitEn: c.unit_en, page: c.page_no });

export async function createConversation(userId: string, title: string): Promise<string> {
  const [row] = await asUser(userId, (tx) => tx<{ id: string }[]>`
    insert into conversations (user_id, title) values (${userId}, ${title}) returning id`);
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

/**
 * Logs one turn and bumps the conversation in a single statement (the CTE always runs).
 * The subselect logs with conversation_id null if the chat was deleted mid-stream, so the
 * turn still counts toward the daily limit instead of failing on the foreign key.
 */
export async function logTurn(t: {
  userId: string; subjectId: string; conversationId: string; question: string; answer: string; chunkIds: string[];
}): Promise<string> {
  const [row] = await asUser(t.userId, (tx) => tx<{ id: string }[]>`
    with bump as (update conversations set updated_at = now() where id = ${t.conversationId})
    insert into chat_logs (user_id, subject_id, conversation_id, question, answer, chunk_ids)
    values (${t.userId}, ${t.subjectId}, (select id from conversations where id = ${t.conversationId}), ${t.question}, ${t.answer}, ${sql.array(t.chunkIds)}::uuid[])
    returning id`);
  return row.id;
}

export async function chatPageData(userId: string) {
  const [subjects, convs] = await Promise.all([
    sql<{ id: string; name_si: string; name_en: string }[]>`select id, name_si, name_en from subjects order by name_en`,
    sql<{ id: string; title: string; updated_at: Date; has_new_reply: boolean }[]>`
      select c.id, c.title, c.updated_at, exists (
        select 1 from chat_logs l
        where l.conversation_id = c.id and l.flag_status = 'answered' and not l.reply_seen
      ) as has_new_reply
      from conversations c
      where c.user_id = ${userId} order by c.updated_at desc limit 50`,
  ]);
  const conversations: ConversationItem[] = convs.map((c) => ({
    id: c.id, title: c.title, updatedAt: c.updated_at.toISOString(), hasNewReply: c.has_new_reply,
  }));
  return { subjects: [...subjects], conversations };
}

/** All turns with sources rebuilt from chunk_ids. null = missing or not this user's; [] = theirs but empty. */
export async function getMessages(userId: string, id: string): Promise<StoredTurn[] | null> {
  if (!(await ownsConversation(userId, id))) return null;
  const rows = await sql<{
    id: string; question: string; answer: string; subject_id: string | null; chunk_ids: string[];
    flag_status: FlagStatus | null; reply: string | null; replied_at: Date | null;
  }[]>`
    select id, question, answer, subject_id, chunk_ids, flag_status, reply, replied_at from chat_logs
    where conversation_id = ${id} order by created_at`;
  const ids = [...new Set(rows.flatMap((r) => r.chunk_ids))];
  const chunks = ids.length ? await sql<(ChunkRef & { id: string })[]>`
    select c.id, c.document_id, c.page_no, d.title, u.name_si as unit_si, u.name_en as unit_en
    from chunks c join documents d on d.id = c.document_id left join units u on u.id = c.unit_id
    where c.id = any(${sql.array(ids)}::uuid[])` : [];
  const byId = new Map(chunks.map((c) => [c.id, c]));
  return rows.map((r) => ({
    id: r.id,
    question: r.question,
    answer: r.answer,
    subjectId: r.subject_id,
    sources: r.chunk_ids.map((cid, i) => {
      const c = byId.get(cid);
      return c ? toSource(i + 1, c) : null;
    }),
    flagStatus: r.flag_status,
    reply: r.reply,
    repliedAt: r.replied_at?.toISOString() ?? null,
  }));
}

export async function deleteConversation(userId: string, id: string) {
  await asUser(userId, (tx) => tx`delete from conversations where id = ${id} and user_id = ${userId}`);
}
