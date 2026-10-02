'use client';
import { useActionState } from 'react';
import { useT } from '@/app/ui/prefs';
import { Button, Input, Notice } from '@/app/ui/ui';
import { joinClassAction } from './actions';

export default function JoinForm() {
  const [state, run, pending] = useActionState(joinClassAction, '');
  const { t } = useT();
  return (
    <form action={run} className="flex flex-wrap items-end gap-2">
      <label className="block space-y-1.5">
        <span className="caps text-subtle">{t.classes.code}</span>
        <Input name="code" required maxLength={12} autoComplete="off" placeholder="K7QM-2XPA" className="w-44 font-mono uppercase tracking-widest" />
      </label>
      <Button disabled={pending}>{t.classes.join}</Button>
      {state && <div className="w-full"><Notice tone={state === 'joined' ? 'ok' : 'danger'}>{t.classes[state]}</Notice></div>}
    </form>
  );
}
