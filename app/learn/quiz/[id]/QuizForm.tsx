'use client';
import { useActionState } from 'react';
import Markdown from '@/app/Markdown';
import type { PublicQuestion } from '@/lib/quiz';
import { submitQuizAction } from '../../quiz-actions';

/** Unanswered quiz: questions and options only (the answer key stays on the server). */
export default function QuizForm({ quizId, questions }: { quizId: string; questions: PublicQuestion[] }) {
  const [state, run, pending] = useActionState(submitQuizAction, '');
  return (
    <form action={run} className="space-y-4">
      <input type="hidden" name="quizId" value={quizId} />
      <input type="hidden" name="count" value={questions.length} />
      {questions.map((q, i) => (
        <fieldset key={i} className="space-y-2 rounded border p-3">
          <legend className="sr-only">Question {i + 1}</legend>
          <div className="flex gap-2 font-medium"><span>{i + 1}.</span><Markdown>{q.question}</Markdown></div>
          {q.options.map((o, j) => (
            <label key={j} className="flex cursor-pointer items-start gap-2 rounded p-1 hover:bg-gray-50">
              <input type="radio" name={`q${i}`} value={j} required className="mt-1" />
              <span className="font-mono text-gray-500">{String.fromCharCode(65 + j)}.</span>
              <Markdown>{o}</Markdown>
            </label>
          ))}
        </fieldset>
      ))}
      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">ඉදිරිපත් කරන්න / Submit</button>
        {state === 'invalid' && <span role="alert" className="text-sm text-red-600">සියලු ප්‍රශ්නවලට පිළිතුරු දෙන්න / Answer every question.</span>}
        {state === 'done' && <span role="alert" className="text-sm text-red-600">දැනටමත් ඉදිරිපත් කර ඇත / Already submitted.</span>}
      </div>
    </form>
  );
}
