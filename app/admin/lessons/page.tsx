import Link from 'next/link';
import { requireStaff, subjectScope } from '@/lib/auth';
import { sql } from '@/lib/db';
import { staffOutline } from '@/lib/lessons';

export default async function LessonsPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const scope = await subjectScope(await requireStaff());
  const subjects = await sql<{ id: string; name_en: string }[]>`
    select id, name_en from subjects where ${scope === null} or id = any(${sql.array(scope ?? [])}::uuid[]) order by name_en`;
  if (!subjects.length) return <p className="text-gray-600">No subjects assigned yet. Ask an admin.</p>;
  const { subject: wanted } = await searchParams;
  const subject = subjects.find((s) => s.id === wanted) ?? subjects[0];
  const units = await staffOutline(subject.id);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Lessons</h1>
      <nav className="flex flex-wrap gap-3 text-sm">
        {subjects.map((s) => (
          <Link key={s.id} href={`/admin/lessons?subject=${s.id}`} className={s.id === subject.id ? 'font-semibold' : 'text-blue-600'}>{s.name_en}</Link>
        ))}
      </nav>
      {!units.length && <p className="text-gray-600">This subject has no units yet. Admins add units under Subjects.</p>}
      {units.map((u) => (
        <section key={u.id} className="rounded border p-3">
          <div className="mb-2 flex items-center gap-3">
            <h2 className="mr-auto font-semibold">{u.name_en} <span className="font-normal text-gray-500">/ {u.name_si}</span></h2>
            <Link href={`/admin/lessons/new?unit=${u.id}`} className="text-sm text-blue-600">+ New lesson</Link>
          </div>
          <ol className="space-y-1 text-sm">
            {u.lessons.map((l) => (
              <li key={l.id} className="flex items-center gap-2">
                <span className="w-8 text-gray-400">{l.sort_order}</span>
                <Link href={`/admin/lessons/${l.id}`} className="text-blue-600">{l.title}</Link>
                <span className={`rounded px-1 text-xs ${l.published ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                  {l.published ? 'Published' : 'Draft'}
                </span>
              </li>
            ))}
          </ol>
          {!u.lessons.length && <p className="text-sm text-gray-500">No lessons yet.</p>}
        </section>
      ))}
    </div>
  );
}
