import { notFound, redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { supabaseServer } from '@/lib/supabase-server';

export type AppUser = { id: string; email: string; role: 'admin' | 'student' };

export async function getUser(): Promise<AppUser | null> {
  const { data } = await (await supabaseServer()).auth.getUser();
  if (!data.user) return null;
  const [p] = await sql<{ role: 'admin' | 'student' }[]>`select role from profiles where id = ${data.user.id}`;
  return { id: data.user.id, email: data.user.email ?? '', role: p?.role ?? 'student' };
}

export async function requireUser(): Promise<AppUser> {
  const user = await getUser();
  if (!user) redirect('/login');
  return user;
}

export async function requireAdmin(): Promise<AppUser> {
  const user = await requireUser();
  if (user.role !== 'admin') notFound();
  return user;
}
