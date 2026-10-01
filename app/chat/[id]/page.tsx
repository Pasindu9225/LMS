import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { isUuid } from '@/lib/db';
import { chatPageData, getMessages } from '@/lib/conversations';
import Chat from '../Chat';

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [turns, data] = await Promise.all([getMessages(user.id, id), chatPageData(user.id)]);
  if (!turns) notFound();
  // key: moving between /chat/a and /chat/b reuses this page, so remount to reset chat state.
  return <Chat key={id} {...data} conversationId={id} initialTurns={turns} />;
}
