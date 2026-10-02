'use client';
import { useActionState, useSyncExternalStore } from 'react';
import { makeQuizAction, type MakeState } from './quiz-actions';

const MESSAGE: Record<Exclude<MakeState, ''>, string> = {
  limit: 'අද ප්‍රශ්නාවලි 20 ඉක්මවා ඇත / You have done 20 quizzes today.',
  material: 'මෙම ඒකකයට තවම ප්‍රමාණවත් අන්තර්ගතයක් නැත / Not enough material for this unit yet.',
  failed: 'ප්‍රශ්නාවලියක් සෑදිය නොහැකි විය, නැවත උත්සාහ කරන්න / Couldn’t make a quiz, please try again.',
  invalid: 'දෝෂයකි / Something went wrong.',
};

const noSubscribe = () => () => {};
const readLang = () => {
  try { return localStorage.getItem('lang') === 'en' ? 'en' : 'si'; } catch { return 'si'; }
};

/** Generates a practice quiz in the student's tutor language (remembered in localStorage). */
export default function QuizMeButton({ unitId }: { unitId: string }) {
  const [state, run, pending] = useActionState(makeQuizAction, '');
  const lang = useSyncExternalStore(noSubscribe, readLang, () => 'si');

  return (
    <form action={run} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name="unitId" value={unitId} />
      <input type="hidden" name="lang" value={lang} />
      <button disabled={pending} className="rounded border border-blue-600 px-3 py-1 text-sm text-blue-700 disabled:opacity-50">
        {pending ? 'සකසමින්… / Making your quiz…' : 'ප්‍රශ්නාවලිය / Quiz me'}
      </button>
      {state && <span role="alert" className="text-sm text-red-600">{MESSAGE[state]}</span>}
    </form>
  );
}
