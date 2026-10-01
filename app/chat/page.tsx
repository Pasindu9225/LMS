import { requireUser } from '@/lib/auth';
import { sql } from '@/lib/db';
import Chat from './Chat';

export default async function ChatPage() {
  await requireUser();
  const subjects = await sql<{ id: string; name_si: string; name_en: string }[]>`
    select id, name_si, name_en from subjects order by name_en`;
  return <Chat subjects={[...subjects]} />;
}
