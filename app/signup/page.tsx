'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';

export default function SignupPage() {
  const router = useRouter();
  const [msg, setMsg] = useState('');

  async function submit(fd: FormData) {
    const { data, error } = await supabaseBrowser().auth.signUp({
      email: String(fd.get('email')),
      password: String(fd.get('password')),
      options: { data: { name: String(fd.get('name')) }, emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) return setMsg(error.message);
    if (!data.session) return setMsg('ඊමේල් පරීක්ෂා කර තහවුරු කරන්න / Check your email to confirm your account.');
    router.replace('/');
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="mb-4 text-xl font-semibold">ලියාපදිංචි වන්න / Sign up</h1>
      <form action={submit} className="space-y-3">
        <input name="name" required placeholder="නම / Name" className="w-full rounded border p-2" />
        <input name="email" type="email" required placeholder="ඊමේල් / Email" className="w-full rounded border p-2" />
        <input name="password" type="password" required minLength={8} placeholder="මුරපදය / Password (8+)" className="w-full rounded border p-2" />
        {msg && <p className="text-sm text-gray-700">{msg}</p>}
        <button className="w-full rounded bg-blue-600 p-2 text-white">ලියාපදිංචි වන්න / Sign up</button>
      </form>
      <p className="mt-4 text-sm">
        <Link href="/login" className="text-blue-600">පිවිසෙන්න / Log in</Link>
      </p>
    </main>
  );
}
