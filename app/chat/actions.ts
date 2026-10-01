'use server';
import { requireUser } from '@/lib/auth';
import { isUuid } from '@/lib/db';
import { deleteConversation } from '@/lib/conversations';

export async function deleteChat(id: string) {
  const user = await requireUser();
  if (!isUuid(id)) return;
  await deleteConversation(user.id, id); // no-op when it isn't this user's
}
