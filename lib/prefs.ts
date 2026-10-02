import { cookies } from 'next/headers';
import { dict, type Lang } from '@/lib/i18n';

export type Theme = 'system' | 'light' | 'dark';
export const PREF_MAX_AGE = 60 * 60 * 24 * 365;

/** Language and theme from cookies (defaults: Sinhala, follow the device). */
export async function getPrefs(): Promise<{ lang: Lang; theme: Theme }> {
  const c = await cookies();
  const theme = c.get('theme')?.value;
  return {
    lang: c.get('lang')?.value === 'en' ? 'en' : 'si',
    theme: theme === 'light' || theme === 'dark' ? theme : 'system',
  };
}

/** Server components: the dictionary for the visitor's language. */
export async function getT() {
  const { lang } = await getPrefs();
  return { lang, t: dict[lang] };
}
