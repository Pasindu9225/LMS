import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { isUuid } from '@/lib/db';
import { lessonForStudent } from '@/lib/lessons';
import Markdown from '@/app/Markdown';
import { setDoneAction } from '../../actions';

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const l = await lessonForStudent(id, user.id);
  if (!l) notFound();

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <nav className="text-sm text-gray-600">
        <Link href="/learn" className="text-blue-600">පාඩම් / Lessons</Link>
        {' › '}<Link href={`/learn/${l.subject_id}`} className="text-blue-600">{l.subject_si} / {l.subject_en}</Link>
        {' › '}{l.unit_si} / {l.unit_en}
      </nav>
      <h1 className="text-2xl font-semibold">{l.title}</h1>

      {l.youtube_id && (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${l.youtube_id}`} title={l.title} className="aspect-video w-full rounded"
          allow="encrypted-media; picture-in-picture" allowFullScreen
        />
      )}
      {l.body && <Markdown>{l.body}</Markdown>}

      {l.pages.length > 0 && (
        <section className="rounded border p-3 text-sm">
          <h2 className="mb-1 font-semibold">පෙළපොත / Textbook</h2>
          <ul className="space-y-1">
            {l.pages.map((p, i) => (
              <li key={i}>
                <a href={`/api/pdf/${p.document_id}?page=${p.page_from}`} target="_blank" rel="noreferrer" className="text-blue-600">
                  {p.title}, පිටු / pages {p.page_from}{p.page_to > p.page_from ? `–${p.page_to}` : ''}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t pt-3">
        <form action={setDoneAction}>
          <input type="hidden" name="lessonId" value={l.id} />
          <input type="hidden" name="done" value={l.done ? '0' : '1'} />
          <button className={`rounded px-4 py-2 text-sm ${l.done ? 'border text-gray-700' : 'bg-green-600 text-white'}`}>
            {l.done ? '✓ සම්පූර්ණයි — අහෝසි කරන්න / Done — undo' : 'සම්පූර්ණ කළා / Mark as done'}
          </button>
        </form>
        <span className="ml-auto flex gap-4 text-sm">
          {l.prev_id && <Link href={`/learn/lesson/${l.prev_id}`} className="text-blue-600">← පෙර / Previous</Link>}
          {l.next_id && <Link href={`/learn/lesson/${l.next_id}`} className="text-blue-600">ඊළඟ / Next →</Link>}
        </span>
      </div>
    </main>
  );
}
