'use client';
import { useActionState } from 'react';
import { btn } from '@/app/ui/ui';

type Action = (prev: string, fd: FormData) => Promise<string>;

/** A form whose server action returns '' on success or a message to show next to the button. */
export default function MessageForm({ action, submit, className, children }: {
  action: Action; submit: string; className?: string; children: React.ReactNode;
}) {
  const [error, run, pending] = useActionState(action, '');
  return (
    <form action={run} className={className}>
      {children}
      <button disabled={pending} className={btn('primary', 'sm')}>{submit}</button>
      {error && <span role="alert" className="text-sm text-danger">{error}</span>}
    </form>
  );
}
