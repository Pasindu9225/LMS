import { requireAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import type { Role } from '@/lib/roles';
import { getT } from '@/lib/prefs';
import { ButtonLink, Empty, Icon, Input, PageHeader, btn } from '@/app/ui/ui';
import RoleForm from './RoleForm';

const PAGE = 50;

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = String(sp.q ?? '').trim().slice(0, 100);
  const page = Math.max(1, Math.floor(Number(sp.page)) || 1);
  const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`; // escape LIKE wildcards in the search text
  const [users, subjects, { t }] = await Promise.all([
    sql<{ id: string; name: string; email: string; role: Role; created_at: Date; subject_ids: string[] }[]>`
      select p.id, p.name, u.email, p.role, p.created_at,
             array(select t.subject_id from teacher_subjects t where t.teacher_id = p.id) as subject_ids
      from profiles p join auth.users u on u.id = p.id
      where ${q === ''} or p.name ilike ${like} or u.email ilike ${like}
      order by p.created_at desc limit ${PAGE + 1} offset ${(page - 1) * PAGE}`,
    sql<{ id: string; name_en: string; name_si: string }[]>`select id, name_en, name_si from subjects order by name_en`,
    getT(),
  ]);
  const S = t.staff;
  const more = users.length > PAGE;
  const href = (p: number) => `/admin/users?${new URLSearchParams({ ...(q && { q }), page: String(p) })}`;

  return (
    <>
      <PageHeader title={S.users} description={S.usersSub} />
      <form className="mb-3 flex gap-2">
        <Input name="q" defaultValue={q} placeholder={S.searchPh} aria-label={S.searchPh} className="max-w-sm" />
        <button className={btn('secondary')}>{t.common.search}</button>
      </form>
      <p className="mb-4 text-xs text-subtle">{S.teacherHint}</p>
      {!users.length ? <Empty>{S.noUsers}</Empty> : (
        <div className="overflow-x-auto rounded-2xl border border-border/70 bg-surface shadow-card">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                {[S.name, S.email, S.joinedOn, S.roleSubjects].map((h) => <th key={h} className="caps px-4 py-2.5 font-normal text-subtle">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.slice(0, PAGE).map((u) => (
                <tr key={u.id} className="align-top">
                  <td className="px-4 py-3 font-medium">{u.name || '—'}</td>
                  <td className="px-4 py-3 text-muted">{u.email}</td>
                  <td className="px-4 py-3 font-mono text-xs text-subtle">{u.created_at.toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' })}</td>
                  <td className="px-4 py-2"><RoleForm id={u.id} role={u.role} subjectIds={u.subject_ids} subjects={[...subjects]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav className="mt-4 flex gap-2">
        {page > 1 && <ButtonLink href={href(page - 1)} variant="ghost" size="sm"><Icon name="arrowLeft" /> {S.newer}</ButtonLink>}
        {more && <ButtonLink href={href(page + 1)} variant="ghost" size="sm">{S.older} <Icon name="arrowRight" /></ButtonLink>}
      </nav>
    </>
  );
}
