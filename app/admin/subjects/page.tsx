import { requireAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import { saveSubject, deleteSubject, saveUnit, deleteUnit } from '@/app/admin/actions';

const input = 'rounded border p-1 text-sm';

export default async function SubjectsPage() {
  await requireAdmin();
  const subjects = await sql<{ id: string; name_si: string; name_en: string; docs: number; classes: number }[]>`
    select s.id, s.name_si, s.name_en, (select count(*)::int from documents d where d.subject_id = s.id) as docs,
           (select count(*)::int from classes c where c.subject_id = s.id) as classes
    from subjects s order by s.name_en`;
  const units = await sql<{ id: string; subject_id: string; name_si: string; name_en: string; sort_order: number }[]>`
    select id, subject_id, name_si, name_en, sort_order from units order by sort_order, name_en`;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Subjects & units</h1>
      <form action={saveSubject} className="flex flex-wrap gap-2">
        <input name="name_si" required placeholder="නම (සිංහල)" className={input} />
        <input name="name_en" required placeholder="Name (English)" className={input} />
        <button className="rounded bg-blue-600 px-3 text-sm text-white">Add subject</button>
      </form>

      {subjects.map((s) => (
        <section key={s.id} className="rounded border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <form action={saveSubject} className="flex flex-wrap gap-2">
              <input type="hidden" name="id" value={s.id} />
              <input name="name_si" defaultValue={s.name_si} required className={input} />
              <input name="name_en" defaultValue={s.name_en} required className={input} />
              <button className="text-sm text-blue-600">Save</button>
            </form>
            {s.docs === 0 && s.classes === 0 ? (
              <form action={deleteSubject}>
                <input type="hidden" name="id" value={s.id} />
                <button className="text-sm text-red-600">Delete</button>
              </form>
            ) : (
              <span className="text-xs text-gray-500">{s.docs} documents · {s.classes} classes</span>
            )}
          </div>

          <ul className="mt-3 space-y-1 pl-4">
            {units.filter((u) => u.subject_id === s.id).map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-2">
                <form action={saveUnit} className="flex flex-wrap gap-2">
                  <input type="hidden" name="id" value={u.id} />
                  <input name="sort_order" type="number" defaultValue={u.sort_order} className={`${input} w-16`} />
                  <input name="name_si" defaultValue={u.name_si} required className={input} />
                  <input name="name_en" defaultValue={u.name_en} required className={input} />
                  <button className="text-sm text-blue-600">Save</button>
                </form>
                <form action={deleteUnit}>
                  <input type="hidden" name="id" value={u.id} />
                  <button className="text-sm text-red-600">Delete</button>
                </form>
              </li>
            ))}
          </ul>
          <form action={saveUnit} className="mt-2 flex flex-wrap gap-2 pl-4">
            <input type="hidden" name="subject_id" value={s.id} />
            <input name="sort_order" type="number" placeholder="#" className={`${input} w-16`} />
            <input name="name_si" required placeholder="ඒකකය (සිංහල)" className={input} />
            <input name="name_en" required placeholder="Unit (English)" className={input} />
            <button className="text-sm text-blue-600">Add unit</button>
          </form>
        </section>
      ))}
    </div>
  );
}
