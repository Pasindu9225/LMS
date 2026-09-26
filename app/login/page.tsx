'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  async function submit(fd: FormData) {
    const { error } = await supabaseBrowser().auth.signInWithPassword({
      email: String(fd.get('email')),
      password: String(fd.get('password')),
    });
    if (error) return setError(error.message);
    router.replace('/');
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="mb-4 text-xl font-semibold">පිවිසෙන්න / Log in</h1>
      <form action={submit} className="space-y-3">
        <input name="email" type="email" required placeholder="ඊමේල් / Email" className="w-full rounded border p-2" />
        <input name="password" type="password" required placeholder="මුරපදය / Password" className="w-full rounded border p-2" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="w-full rounded bg-blue-600 p-2 text-white">පිවිසෙන්න / Log in</button>
      </form>
      <p className="mt-4 text-sm">
        <Link href="/signup" className="text-blue-600">ලියාපදිංචි වන්න / Sign up</Link>
      </p>
    </main>
  );
}
