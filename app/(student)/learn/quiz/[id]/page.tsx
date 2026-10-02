import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { isUuid } from '@/lib/db';
import { getQuiz } from '@/lib/practice';
import { publicQuestions } from '@/lib/quiz';
import { getT } from '@/lib/prefs';
import Markdown from '@/app/Markdown';
import { Badge, Card, Icon, PageHeader } from '@/app/ui/ui';
import QuizForm from './QuizForm';
import QuizMeButton from '../../QuizMeButton';

// Quiz generation runs in a server action on this page and can take ~30 s when Gemini is slow.
export const maxDuration = 60;

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [q, { lang, t }] = await Promise.all([getQuiz(user.id, id), getT()]);
  if (!q) notFound();
  const unit = lang === 'si' ? q.unit_si : q.unit_en;
  const submitted = q.submitted_at && q.answers;
  const pct = submitted ? Math.round((100 * (q.score ?? 0)) / q.questions.length) : 0;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href={`/learn/${q.subject_id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <Icon name="arrowLeft" /> {unit}
      </Link>
      <PageHeader eyebrow={unit} title={t.quiz.title} />

      {!submitted ? (
        <QuizForm quizId={q.id} questions={publicQuestions(q.questions)} />
      ) : (
        <div className="space-y-4">
          <Card className="flex items-center gap-4">
            <p className="font-mono text-4xl font-semibold tracking-tight" role="status">{q.score}/{q.questions.length}</p>
            <Badge tone={pct >= 60 ? 'ok' : 'warn'}>{pct}%</Badge>
            <div className="ml-auto"><QuizMeButton unitId={q.unit_id} /></div>
          </Card>
          {q.questions.map((x, i) => {
            const chosen = q.answers![i];
            const src = q.sources[x.chunkId];
            const right = chosen === x.answer;
            return (
              <Card key={i} className="space-y-3">
                <div className="flex gap-2 font-medium">
                  <span aria-hidden className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${right ? 'bg-grad text-white' : 'border border-danger/50 text-danger'}`}>
                    <Icon name={right ? 'check' : 'x'} className="size-3" />
                  </span>
                  <span className="sr-only">{right ? t.quiz.gotRight : t.quiz.gotWrong}:</span>
                  <Markdown>{x.question}</Markdown>
                </div>
                <ol className="space-y-1.5">
                  {x.options.map((o, j) => (
                    <li
                      key={j}
                      className={`flex items-start gap-3 rounded-xl border px-3 py-2 ${j === x.answer ? 'border-accent bg-accent-soft' : j === chosen ? 'border-danger/50 bg-danger-soft' : 'border-border'}`}
                    >
                      <span className="font-mono text-xs leading-6 text-subtle">{String.fromCharCode(65 + j)}</span>
                      <div className="min-w-0 flex-1"><Markdown>{o}</Markdown></div>
                      {j === chosen && <Badge tone={j === x.answer ? 'ok' : 'danger'}>{t.quiz.yourAnswer}</Badge>}
                      {j === x.answer && <Badge tone="ok">{t.quiz.correct}</Badge>}
                    </li>
                  ))}
                </ol>
                <div className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted"><Markdown>{x.explanation}</Markdown></div>
                {src && (
                  <a href={`/api/pdf/${src.documentId}?page=${src.page}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono text-xs text-muted hover:text-accent">
                    [{t.quiz.source}] {src.title} · {t.common.page} {src.page} <Icon name="external" className="size-3" />
                  </a>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
