'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { useT } from '@/app/ui/prefs';
import { Button, Field, Input, Notice } from '@/app/ui/ui';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useT();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(fd: FormData) {
    setPending(true);
    const { error } = await supabaseBrowser().auth.signInWithPassword({
      email: String(fd.get('email')),
      password: String(fd.get('password')),
    });
    if (error) {
      setPending(false);
      return setError(error.message);
    }
    router.replace('/');
    router.refresh();
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t.auth.login}</h1>
      <p className="mt-1 text-sm text-muted">{t.auth.loginSub}</p>
      <form action={submit} className="mt-6 space-y-4">
        <Field label={t.auth.email}><Input name="email" type="email" autoComplete="email" required /></Field>
        <Field label={t.auth.password}><Input name="password" type="password" autoComplete="current-password" required /></Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button disabled={pending} className="w-full">{pending ? t.common.loading : t.auth.login}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        {t.auth.noAccount} <Link href="/signup" className="font-medium text-accent underline-offset-2 hover:underline">{t.auth.signup}</Link>
      </p>
    </>
  );
}
