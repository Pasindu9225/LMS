import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';

export default async function Home() {
  const user = await getUser();
  redirect(!user ? '/login' : user.role === 'admin' ? '/admin/documents' : user.role === 'teacher' ? '/admin/flags' : '/chat');
}
