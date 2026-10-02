import { sql, asUser } from '@/lib/db';
import type { FlagStatus } from '@/lib/text';

/** Student sends their own, not-yet-flagged answer to a teacher. false = not theirs, missing, or already flagged. */
export async function flagAnswer(userId: string, logId: string, note: string): Promise<boolean> {
  const r = await asUser(userId, (tx) => tx`
    update chat_logs set flag_status = 'open', flag_note = ${note || null}, flagged_at = now()
    where id = ${logId} and user_id = ${userId} and flag_status is null`);
  return r.count === 1;
}

/** Reply to an open flag, or correct an existing reply. The student sees it as new. */
export async function replyFlag(adminId: string, logId: string, reply: string): Promise<boolean> {
  const r = await asUser(adminId, (tx) => tx`
    update chat_logs
    set flag_status = 'answered', reply = ${reply}, replied_at = now(), replied_by = ${adminId}, reply_seen = false
    where id = ${logId} and flag_status in ('open', 'answered')`);
  return r.count === 1;
}

export async function dismissFlag(adminId: string, logId: string): Promise<boolean> {
  const r = await asUser(adminId, (tx) => tx`
    update chat_logs set flag_status = 'dismissed' where id = ${logId} and flag_status = 'open'`);
  return r.count === 1;
}

/**
 * Marks replies the student's screen actually showed (by answer id) as seen, clearing the sidebar dot.
 * Not by conversation: a refresh can load a reply that the open tab never displays.
 */
export async function markRepliesSeen(userId: string, logIds: string[]) {
  if (!logIds.length) return;
  await asUser(userId, (tx) => tx`
    update chat_logs set reply_seen = true
    where id = any(${sql.array(logIds)}::uuid[]) and user_id = ${userId}
      and flag_status = 'answered' and not reply_seen`);
}

export type FlagRow = {
  id: string; question: string; answer: string; flag_note: string | null; flagged_at: Date;
  reply: string | null; replied_at: Date | null; chunk_ids: string[]; student: string; subject: string | null;
};

/** Staff queue: open flags oldest first (first come, first served); others newest first. scope null = all subjects. */
export function listFlags(status: FlagStatus, scope: string[] | null) {
  const order = status === 'open' ? sql`l.flagged_at asc` : sql`l.flagged_at desc`;
  return sql<FlagRow[]>`
    select l.id, l.question, l.answer, l.flag_note, l.flagged_at, l.reply, l.replied_at, l.chunk_ids,
           p.name as student, s.name_en as subject
    from chat_logs l join profiles p on p.id = l.user_id left join subjects s on s.id = l.subject_id
    where l.flag_status = ${status}
      and (${scope === null} or l.subject_id = any(${sql.array(scope ?? [])}::uuid[]))
    order by ${order} limit 100`;
}
