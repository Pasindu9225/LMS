'use client';
import { useActionState } from 'react';

type Action = (prev: string, fd: FormData) => Promise<string>;

/** A form whose server action returns '' on success or a message to show next to the button. */
export default function MessageForm({ action, submit, className, children }: {
  action: Action; submit: string; className?: string; children: React.ReactNode;
}) {
  const [error, run, pending] = useActionState(action, '');
  return (
    <form action={run} className={className}>
      {children}
      <button disabled={pending} className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50">{submit}</button>
      {error && <span role="alert" className="text-sm text-red-600">{error}</span>}
    </form>
  );
}
