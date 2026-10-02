import Link from 'next/link';
import { requireStaff, subjectScope } from '@/lib/auth';
import { sql } from '@/lib/db';
import { listStaffClasses } from '@/lib/classes';
import { getT } from '@/lib/prefs';
import { Badge, Card, Empty, Field, Input, PageHeader, Select } from '@/app/ui/ui';
import { createClassAction } from '../class-actions';
import MessageForm from '../MessageForm';

export default async function ClassesPage() {
  const user = await requireStaff();
  const scope = await subjectScope(user);
  const [classes, subjects, teachers, { t }] = await Promise.all([
    listStaffClasses(user),
    sql<{ id: string; name_en: string }[]>`
      select id, name_en from subjects where ${scope === null} or id = any(${sql.array(scope ?? [])}::uuid[]) order by name_en`,
    user.role === 'admin' ? sql<{ id: string; name: string; subjects: string }[]>`
      select p.id, p.name, string_agg(s.name_en, ', ' order by s.name_en) as subjects
      from profiles p join teacher_subjects ts on ts.teacher_id = p.id join subjects s on s.id = ts.subject_id
      where p.role = 'teacher' group by p.id, p.name order by p.name` : Promise.resolve([]),
    getT(),
  ]);
  const S = t.staff;

  return (
    <>
      <PageHeader title={S.classes} description={S.classesSub} />
      {subjects.length ? (
        <Card className="mb-6">
          <MessageForm action={createClassAction} submit={S.createClass} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_8rem_1fr_auto]">
            <Field label={S.className}><Input name="name" required maxLength={100} placeholder={S.classNamePh} /></Field>
            <Field label={S.subject}>
              <Select name="subjectId" required className="w-full">{subjects.map((s) => <option key={s.id} value={s.id}>{s.name_en}</option>)}</Select>
            </Field>
            <Field label={S.batchYear}><Input name="batchYear" type="number" min={2000} max={2100} /></Field>
            {user.role === 'admin' ? (
              <Field label={S.teacher}>
                <Select name="teacherId" defaultValue={user.id} className="w-full">
                  <option value={user.id}>{S.me}</option>
                  {teachers.map((tc) => <option key={tc.id} value={tc.id}>{tc.name} — {tc.subjects}</option>)}
                </Select>
              </Field>
            ) : <span className="hidden lg:block" />}
          </MessageForm>
        </Card>
      ) : <div className="mb-6"><Empty>{S.noSubjectsAssigned}</Empty></div>}

      {!classes.length ? <Empty>{S.noClasses}</Empty> : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                {[S.className, S.subject, S.batch, S.teacher, S.students].map((h) => <th key={h} className="caps px-4 py-2.5 font-normal text-subtle">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {classes.map((c) => (
                <tr key={c.id} className={`hover:bg-surface-2 ${c.archived ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3">
                    <Link href={`/admin/classes/${c.id}`} className="font-medium hover:text-accent">{c.name}</Link>
                    {c.archived && <Badge className="ml-2">{S.archived}</Badge>}
                  </td>
                  <td className="px-4 py-3 text-muted">{c.subject}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{c.batch_year ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">{c.teacher ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{c.students}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
