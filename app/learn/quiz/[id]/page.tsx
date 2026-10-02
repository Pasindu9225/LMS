import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { isUuid } from '@/lib/db';
import { getQuiz } from '@/lib/practice';
import { publicQuestions } from '@/lib/quiz';
import Markdown from '@/app/Markdown';
import QuizForm from './QuizForm';
import QuizMeButton from '../../QuizMeButton';

// Quiz generation runs in a server action on this page and can take ~30 s when Gemini is slow.
export const maxDuration = 60;

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const q = await getQuiz(user.id, id);
  if (!q) notFound();

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <nav className="text-sm">
        <Link href={`/learn/${q.subject_id}`} className="text-blue-600">← {q.unit_si} / {q.unit_en}</Link>
      </nav>
      <h1 className="text-xl font-semibold">ප්‍රශ්නාවලිය / Practice quiz</h1>

      {!q.submitted_at || !q.answers ? (
        <QuizForm quizId={q.id} questions={publicQuestions(q.questions)} />
      ) : (
        <>
          <p className="text-2xl font-semibold" role="status">
            {q.score}/{q.questions.length}
          </p>
          {q.questions.map((x, i) => {
            const chosen = q.answers![i];
            const src = q.sources[x.chunkId];
            return (
              <section key={i} className="space-y-2 rounded border p-3">
                <div className="flex gap-2 font-medium">
                  <span aria-label={chosen === x.answer ? 'correct' : 'wrong'}>{chosen === x.answer ? '✅' : '❌'}</span>
                  <span>{i + 1}.</span><Markdown>{x.question}</Markdown>
                </div>
                <ol className="space-y-1">
                  {x.options.map((o, j) => (
                    <li
                      key={j}
                      className={`flex items-start gap-2 rounded p-1 ${j === x.answer ? 'bg-green-50 ring-1 ring-green-600' : j === chosen ? 'bg-red-50 ring-1 ring-red-500' : ''}`}
                    >
                      <span className="font-mono text-gray-500">{String.fromCharCode(65 + j)}.</span>
                      <Markdown>{o}</Markdown>
                      {j === chosen && <span className="ml-auto text-xs text-gray-500">ඔබේ පිළිතුර / your answer</span>}
                    </li>
                  ))}
                </ol>
                <div className="rounded bg-gray-50 p-2 text-sm"><Markdown>{x.explanation}</Markdown></div>
                {src && (
                  <a href={`/api/pdf/${src.documentId}?page=${src.page}`} target="_blank" rel="noreferrer" className="text-sm text-blue-600">
                    {src.title}, පිටුව / page {src.page}
                  </a>
                )}
              </section>
            );
          })}
          <QuizMeButton unitId={q.unit_id} />
        </>
      )}
    </main>
  );
}
