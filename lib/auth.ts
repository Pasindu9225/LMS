import { notFound, redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { supabaseServer } from '@/lib/supabase-server';
import type { Role } from '@/lib/roles';

export type AppUser = { id: string; email: string; role: Role };

export async function getUser(): Promise<AppUser | null> {
  const { data } = await (await supabaseServer()).auth.getUser();
  if (!data.user) return null;
  const [p] = await sql<{ role: Role }[]>`select role from profiles where id = ${data.user.id}`;
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

/** Admins and teachers. Teachers are further limited to their subjects (see subjectScope). */
export async function requireStaff(): Promise<AppUser> {
  const user = await requireUser();
  if (user.role !== 'admin' && user.role !== 'teacher') notFound();
  return user;
}

/** null = every subject (admin); otherwise the teacher's assigned subject ids. */
export async function subjectScope(user: AppUser): Promise<string[] | null> {
  if (user.role === 'admin') return null;
  if (user.role !== 'teacher') return [];
  const rows = await sql<{ subject_id: string }[]>`select subject_id from teacher_subjects where teacher_id = ${user.id}`;
  return rows.map((r) => r.subject_id);
}

const inScope = (scope: string[] | null, subjectId: string | null) =>
  scope === null || (subjectId !== null && scope.includes(subjectId));

/** 404 unless the subject is in the user's scope. */
export async function requireSubject(user: AppUser, subjectId: string) {
  if (!inScope(await subjectScope(user), subjectId)) notFound();
}

/** 404 unless the document exists and its subject is in scope. */
export async function requireDocument(user: AppUser, documentId: string) {
  const [d] = await sql<{ subject_id: string }[]>`select subject_id from documents where id = ${documentId}`;
  if (!d || !inScope(await subjectScope(user), d.subject_id)) notFound();
  return d;
}

/** 404 unless the chat log exists and its subject is in scope. */
export async function requireLog(user: AppUser, logId: string) {
  const [l] = await sql<{ subject_id: string | null }[]>`select subject_id from chat_logs where id = ${logId}`;
  if (!l || !inScope(await subjectScope(user), l.subject_id)) notFound();
}
