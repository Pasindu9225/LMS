'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { useT } from '@/app/ui/prefs';
import { Button, Field, Input, Notice } from '@/app/ui/ui';

export default function SignupPage() {
  const router = useRouter();
  const { t } = useT();
  const [msg, setMsg] = useState<{ tone: 'danger' | 'ok'; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(fd: FormData) {
    setPending(true);
    const { data, error } = await supabaseBrowser().auth.signUp({
      email: String(fd.get('email')),
      password: String(fd.get('password')),
      options: { data: { name: String(fd.get('name')) }, emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setPending(false);
    if (error) return setMsg({ tone: 'danger', text: error.message });
    if (!data.session) return setMsg({ tone: 'ok', text: t.auth.checkEmail });
    router.replace('/');
    router.refresh();
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t.auth.signup}</h1>
      <p className="mt-1 text-sm text-muted">{t.auth.signupSub}</p>
      <form action={submit} className="mt-6 space-y-4">
        <Field label={t.auth.name}><Input name="name" autoComplete="name" required /></Field>
        <Field label={t.auth.email}><Input name="email" type="email" autoComplete="email" required /></Field>
        <Field label={t.auth.password} hint={t.auth.passwordHint}>
          <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <Button disabled={pending} className="w-full">{pending ? t.common.loading : t.auth.signup}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        {t.auth.haveAccount} <Link href="/login" className="font-medium text-accent underline-offset-2 hover:underline">{t.auth.login}</Link>
      </p>
    </>
  );
}
