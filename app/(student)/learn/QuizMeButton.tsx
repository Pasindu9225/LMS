'use client';
import { useActionState } from 'react';
import { useT } from '@/app/ui/prefs';
import { Icon, btn } from '@/app/ui/ui';
import { makeQuizAction } from './quiz-actions';

/** Generates a practice quiz in the selected language. */
export default function QuizMeButton({ unitId }: { unitId: string }) {
  const [state, run, pending] = useActionState(makeQuizAction, '');
  const { lang, t } = useT();
  return (
    <form action={run} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name="unitId" value={unitId} />
      <input type="hidden" name="lang" value={lang} />
      <button disabled={pending} className={btn('secondary', 'sm')}>
        <Icon name="sparkles" className={`size-3.5 ${pending ? 'animate-pulse' : ''}`} /> {pending ? t.quiz.making : t.quiz.quizMe}
      </button>
      {state && <span role="alert" className="w-full text-xs text-danger">{t.quiz[state]}</span>}
    </form>
  );
}
