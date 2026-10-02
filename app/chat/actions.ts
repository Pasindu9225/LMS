'use server';
import { requireUser } from '@/lib/auth';
import { isUuid } from '@/lib/db';
import { deleteConversation } from '@/lib/conversations';
import { flagAnswer } from '@/lib/flags';
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
