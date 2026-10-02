import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { isUuid } from '@/lib/db';
import { subjectOutline } from '@/lib/lessons';
import { groupPapers } from '@/lib/papers';

const pdf = (id: string) => `/api/pdf/${id}?page=1`;

export default async function SubjectPage({ params }: { params: Promise<{ subjectId: string }> }) {
  const user = await requireUser();
  const { subjectId } = await params;
  if (!isUuid(subjectId)) notFound();
  const outline = await subjectOutline(subjectId, user.id);
  if (!outline) notFound();
  const years = groupPapers(outline.papers);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4">
      <div className="flex items-center gap-3">
        <h1 className="mr-auto text-xl font-semibold">{outline.subject.name_si} / {outline.subject.name_en}</h1>
        <Link href="/learn" className="text-sm text-blue-600">← පාඩම් / Lessons</Link>
      </div>

      {!outline.units.length && <p className="text-gray-600">තවම පාඩම් නැත / No lessons yet.</p>}
      {outline.units.map((u) => {
        const done = u.lessons.filter((l) => l.done).length;
        return (
          <section key={u.id} className="rounded border p-3">
            <h2 className="mb-2 flex items-baseline gap-2 font-semibold">
              <span className="mr-auto">{u.name_si} / {u.name_en}</span>
              <span className="text-sm font-normal text-gray-600">{done}/{u.lessons.length} done</span>
            </h2>
            <ol className="space-y-1">
              {u.lessons.map((l) => (
                <li key={l.id} className="flex items-center gap-2">
                  <span aria-label={l.done ? 'done' : 'not done'} className={l.done ? 'text-green-600' : 'text-gray-300'}>✓</span>
                  <Link href={`/learn/lesson/${l.id}`} className="text-blue-600">{l.title}</Link>
                </li>
              ))}
            </ol>
          </section>
        );
      })}

      <section className="space-y-2">
        <h2 className="font-semibold">පසුගිය ප්‍රශ්න පත්‍ර / Past papers</h2>
        {!years.length && <p className="text-sm text-gray-600">තවම නැත / None yet.</p>}
        <table className="w-full text-left text-sm">
          <tbody>
            {years.map((y) => (
              <tr key={y.year ?? 'unknown'} className="border-b align-top">
                <td className="w-20 py-2 font-medium">{y.year ?? '—'}</td>
                <td className="py-2">
                  {y.papers.length ? y.papers.map((d) => <a key={d.id} href={pdf(d.id)} target="_blank" rel="noreferrer" className="block text-blue-600">{d.title}</a>) : '—'}
                </td>
                <td className="py-2">
                  {y.schemes.length ? y.schemes.map((d) => <a key={d.id} href={pdf(d.id)} target="_blank" rel="noreferrer" className="block text-blue-600">ලකුණු දීමේ පටිපාටිය / Marking scheme: {d.title}</a>) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
