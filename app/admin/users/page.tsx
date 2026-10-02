import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import type { Role } from '@/lib/roles';
import RoleForm from './RoleForm';

const PAGE = 50;

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = String(sp.q ?? '').trim().slice(0, 100);
  const page = Math.max(1, Math.floor(Number(sp.page)) || 1);
  const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`; // escape LIKE wildcards in the search text
  const [users, subjects] = await Promise.all([
    sql<{ id: string; name: string; email: string; role: Role; created_at: Date; subject_ids: string[] }[]>`
      select p.id, p.name, u.email, p.role, p.created_at,
             array(select t.subject_id from teacher_subjects t where t.teacher_id = p.id) as subject_ids
      from profiles p join auth.users u on u.id = p.id
      where ${q === ''} or p.name ilike ${like} or u.email ilike ${like}
      order by p.created_at desc limit ${PAGE + 1} offset ${(page - 1) * PAGE}`,
    sql<{ id: string; name_en: string }[]>`select id, name_en from subjects order by name_en`,
  ]);
  const more = users.length > PAGE;
  const href = (p: number) => `/admin/users?${new URLSearchParams({ ...(q && { q }), page: String(p) })}`;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Users</h1>
      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search name or email" className="rounded border p-1 text-sm" />
        <button className="rounded border px-3 text-sm">Search</button>
      </form>
      <p className="text-xs text-gray-600">Teachers manage documents, flags and chat logs for the ticked subjects only.</p>
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b"><th>Name</th><th>Email</th><th>Joined</th><th>Role &amp; subjects</th></tr></thead>
        <tbody>
          {users.slice(0, PAGE).map((u) => (
            <tr key={u.id} className="border-b align-top">
              <td className="py-2">{u.name || '—'}</td>
              <td>{u.email}</td>
              <td>{u.created_at.toLocaleDateString('en-LK', { timeZone: 'Asia/Colombo' })}</td>
              <td><RoleForm id={u.id} role={u.role} subjectIds={u.subject_ids} subjects={[...subjects]} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!users.length && <p className="text-gray-600">No users found.</p>}
      <nav className="flex gap-4 text-sm">
        {page > 1 && <Link href={href(page - 1)} className="text-blue-600">← Newer</Link>}
        {more && <Link href={href(page + 1)} className="text-blue-600">Older →</Link>}
      </nav>
    </div>
  );
}
