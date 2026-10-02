import { requireUser } from '@/lib/auth';
import { chatPageData } from '@/lib/conversations';
import Chat from './Chat';

export default async function ChatPage() {
  const user = await requireUser();
  return <Chat {...await chatPageData(user.id)} initialTurns={[]} />;
}
