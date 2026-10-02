import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { listStudentClasses } from '@/lib/classes';
import { colomboDate } from '@/lib/text';
import { leaveClassAction } from './actions';
import JoinForm from './JoinForm';
import ConfirmButton from '@/app/admin/ConfirmButton';

export default async function ClassesPage() {
  const user = await requireUser();
  const classes = await listStudentClasses(user.id);

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-center gap-3">
        <h1 className="mr-auto text-xl font-semibold">මගේ පන්ති / My classes</h1>
        <Link href="/chat" className="text-sm text-blue-600">← ගුරු සහායක / Tutor</Link>
      </div>
      <JoinForm />
      {!classes.length && <p className="text-gray-600">ගුරුවරයාගෙන් පන්ති කේතයක් ලබාගන්න / Ask your teacher for a class code.</p>}
      {classes.map((c) => (
        <section key={c.id} className={`space-y-2 rounded border p-3 ${c.archived ? 'opacity-60' : ''}`}>
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="font-semibold">{c.name}</h2>
            <span className="text-sm text-gray-600">{c.subject_si} / {c.subject_en} · {c.teacher ?? '—'}{c.batch_year ? ` · ${c.batch_year}` : ''}</span>
            <form action={leaveClassAction} className="ml-auto">
              <input type="hidden" name="classId" value={c.id} />
              <ConfirmButton message={`Leave ${c.name}?`} className="text-xs text-gray-500 underline">ඉවත් වන්න / Leave</ConfirmButton>
            </form>
          </div>
          {c.posts.map((p) => (
            <div key={p.id} className="rounded bg-gray-50 p-2 text-sm">
              <p className="text-xs text-gray-500">{colomboDate(p.created_at)}</p>
              <p className="whitespace-pre-wrap">{p.body}</p>
            </div>
          ))}
          {!c.posts.length && <p className="text-sm text-gray-500">තවම නිවේදන නැත / No announcements yet.</p>}
        </section>
      ))}
    </main>
  );
}
