'use server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { PREF_MAX_AGE } from '@/lib/prefs';

const opts = { maxAge: PREF_MAX_AGE, path: '/', sameSite: 'lax' as const };

export async function setLang(lang: string) {
  (await cookies()).set('lang', lang === 'en' ? 'en' : 'si', opts);
  revalidatePath('/', 'layout');
}

export async function setTheme(theme: string) {
  const c = await cookies();
  if (theme === 'light' || theme === 'dark') c.set('theme', theme, opts);
  else c.delete('theme');
  revalidatePath('/', 'layout');
}
