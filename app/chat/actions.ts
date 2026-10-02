'use server';
import { requireUser } from '@/lib/auth';
import { isUuid } from '@/lib/db';
import { deleteConversation } from '@/lib/conversations';
import { flagAnswer, markRepliesSeen } from '@/lib/flags';
import { cleanNote } from '@/lib/text';

export async function deleteChat(id: string) {
  const user = await requireUser();
  if (!isUuid(id)) return;
  await deleteConversation(user.id, id); // no-op when it isn't this user's
}

/** false = invalid, not this student's answer, or already sent. */
export async function flagChat(logId: string, note: string): Promise<boolean> {
  const user = await requireUser();
  const clean = cleanNote(note);
  if (!isUuid(logId) || clean === null) return false;
  return flagAnswer(user.id, logId, clean);
}

/** Called by the chat once it has displayed these answers' replies. */
export async function markSeen(logIds: string[]) {
  const user = await requireUser();
  if (!Array.isArray(logIds) || logIds.length > 200 || !logIds.every(isUuid)) return;
  await markRepliesSeen(user.id, logIds);
}
