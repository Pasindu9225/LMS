'use client';
import { useActionState } from 'react';
import { joinClassAction, type JoinState } from './actions';

const MESSAGE: Record<Exclude<JoinState, ''>, string> = {
  joined: 'පන්තියට එක් විය / Joined the class.',
  invalid: 'කේතය වැරදියි / That code is not valid.',
  archived: 'මෙම පන්තිය වසා ඇත / This class is closed.',
  already: 'ඔබ දැනටමත් මෙම පන්තියේ සිටී / You are already in this class.',
  staff: 'සිසුන්ට පමණි / Only students can join classes.',
};

export default function JoinForm() {
  const [state, run, pending] = useActionState(joinClassAction, '');
  return (
    <form action={run} className="flex flex-wrap items-center gap-2 rounded border p-3">
      <input
        name="code" required maxLength={12} autoComplete="off" placeholder="K7QM-2XPA" aria-label="පන්ති කේතය / Class code"
        className="w-40 rounded border p-2 font-mono uppercase tracking-widest"
      />
      <button disabled={pending} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">එක් වන්න / Join</button>
      {state && <p role="status" className={`w-full text-sm ${state === 'joined' ? 'text-green-700' : 'text-red-600'}`}>{MESSAGE[state]}</p>}
    </form>
  );
}
