import Link from 'next/link';
import { requireStaff, subjectScope } from '@/lib/auth';
import { sql } from '@/lib/db';
import { listStaffClasses } from '@/lib/classes';
import { createClassAction } from '../class-actions';
import MessageForm from '../MessageForm';

const input = 'rounded border p-1 text-sm';

export default async function ClassesPage() {
  const user = await requireStaff();
  const scope = await subjectScope(user);
  const [classes, subjects, teachers] = await Promise.all([
    listStaffClasses(user),
    sql<{ id: string; name_en: string }[]>`
      select id, name_en from subjects where ${scope === null} or id = any(${sql.array(scope ?? [])}::uuid[]) order by name_en`,
    user.role === 'admin' ? sql<{ id: string; name: string; subjects: string }[]>`
      select p.id, p.name, string_agg(s.name_en, ', ' order by s.name_en) as subjects
      from profiles p join teacher_subjects ts on ts.teacher_id = p.id join subjects s on s.id = ts.subject_id
      where p.role = 'teacher' group by p.id, p.name order by p.name` : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Classes</h1>
      {subjects.length ? (
        <MessageForm action={createClassAction} submit="Create class" className="flex flex-wrap items-center gap-2 rounded border p-3">
          <input name="name" required maxLength={100} placeholder="Class name, e.g. 2027 Chemistry – Colombo" className={`${input} w-72`} />
          <select name="subjectId" required className={input}>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name_en}</option>)}
          </select>
          <input name="batchYear" type="number" min={2000} max={2100} placeholder="Batch year" className={`${input} w-28`} />
          {user.role === 'admin' && (
            <select name="teacherId" defaultValue={user.id} className={input} aria-label="Teacher">
              <option value={user.id}>Me (admin)</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.subjects}</option>)}
            </select>
          )}
        </MessageForm>
      ) : <p className="text-gray-600">No subjects assigned yet. Ask an admin.</p>}
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b"><th>Class</th><th>Subject</th><th>Batch</th><th>Teacher</th><th>Students</th><th /></tr></thead>
        <tbody>
          {classes.map((c) => (
            <tr key={c.id} className={`border-b ${c.archived ? 'text-gray-400' : ''}`}>
              <td className="py-2">{c.name}{c.archived && ' (archived)'}</td>
              <td>{c.subject}</td>
              <td>{c.batch_year ?? '—'}</td>
              <td>{c.teacher ?? '—'}</td>
              <td>{c.students}</td>
              <td><Link href={`/admin/classes/${c.id}`} className="text-blue-600">Open</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!classes.length && <p className="text-gray-600">No classes yet.</p>}
    </div>
  );
}
