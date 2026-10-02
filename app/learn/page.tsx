import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { learnSubjects } from '@/lib/lessons';

export default async function LearnPage() {
  const user = await requireUser();
  const subjects = await learnSubjects(user.id);

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-center gap-3">
        <h1 className="mr-auto text-xl font-semibold">පාඩම් / Lessons</h1>
        <Link href="/chat" className="text-sm text-blue-600">← ගුරු සහායක / Tutor</Link>
      </div>
      {!subjects.length && <p className="text-gray-600">තවම විෂයයන් නොමැත / No subjects yet.</p>}
      <ul className="space-y-2">
        {subjects.map((s) => (
          <li key={s.id}>
            <Link href={`/learn/${s.id}`} className="block rounded border p-3 hover:bg-gray-50">
              <div className="flex items-baseline gap-2">
                <span className="mr-auto font-medium">{s.name_si} / {s.name_en}</span>
                <span className="text-sm text-gray-600">{s.done}/{s.total}</span>
              </div>
              <div className="mt-2 h-2 rounded bg-gray-100" role="progressbar" aria-valuenow={s.done} aria-valuemin={0} aria-valuemax={s.total}>
                <div className="h-2 rounded bg-green-600" style={{ width: `${s.total ? (100 * s.done) / s.total : 0}%` }} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
