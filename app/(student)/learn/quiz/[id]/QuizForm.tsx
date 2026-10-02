'use client';
import { useActionState } from 'react';
import Markdown from '@/app/Markdown';
import type { PublicQuestion } from '@/lib/quiz';
import { fmt } from '@/lib/i18n';
import { useT } from '@/app/ui/prefs';
import { Button, Card, Notice } from '@/app/ui/ui';
import { submitQuizAction } from '../../quiz-actions';

/** Unanswered quiz: questions and options only (the answer key stays on the server). */
export default function QuizForm({ quizId, questions }: { quizId: string; questions: PublicQuestion[] }) {
  const [state, run, pending] = useActionState(submitQuizAction, '');
  const { t } = useT();
  return (
    <form action={run} className="space-y-4">
      <input type="hidden" name="quizId" value={quizId} />
      <input type="hidden" name="count" value={questions.length} />
      {questions.map((q, i) => (
        <Card key={i}>
          <fieldset className="space-y-2">
            <legend className="mb-2 flex gap-2 font-medium">
              <span className="font-mono text-subtle">{String(i + 1).padStart(2, '0')}</span>
              <span className="sr-only">{fmt(t.quiz.question, { n: i + 1 })}: </span>
              <Markdown>{q.question}</Markdown>
            </legend>
            {q.options.map((o, j) => (
              <label
                key={j}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-border-strong has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
              >
                <input type="radio" name={`q${i}`} value={j} required className="mt-1 accent-[var(--accent)]" />
                <span className="font-mono text-xs leading-6 text-subtle">{String.fromCharCode(65 + j)}</span>
                <Markdown>{o}</Markdown>
              </label>
            ))}
          </fieldset>
        </Card>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending}>{t.quiz.submit}</Button>
        {state === 'invalid' && <Notice tone="danger">{t.quiz.answerAll}</Notice>}
        {state === 'done' && <Notice tone="danger">{t.quiz.alreadySubmitted}</Notice>}
      </div>
    </form>
  );
}
