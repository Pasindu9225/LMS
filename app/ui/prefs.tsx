'use client';
import { createContext, useContext, useEffect, useRef, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { dict, type Lang, type T } from '@/lib/i18n';
import type { Theme } from '@/lib/prefs';
import { setLang, setTheme } from '@/app/prefs-actions';
import { Icon, type IconName } from './ui';

const Ctx = createContext<{ lang: Lang; theme: Theme }>({ lang: 'si', theme: 'system' });

/** Language and theme (from cookies, read on the server) for client components. */
export function PrefsProvider({ lang, theme, hasLangCookie, children }: { lang: Lang; theme: Theme; hasLangCookie: boolean; children: ReactNode }) {
  // One-time migration: the chat used to keep its language in localStorage.
  useEffect(() => {
    if (hasLangCookie) return;
    try {
      if (localStorage.getItem('lang') === 'en') setLang('en');
    } catch { /* private mode */ }
  }, [hasLangCookie]);
  return <Ctx.Provider value={{ lang, theme }}>{children}</Ctx.Provider>;
}

export const usePrefs = () => useContext(Ctx);
export function useT(): { lang: Lang; t: T } {
  const { lang } = useContext(Ctx);
  return { lang, t: dict[lang] };
}

const seg = 'inline-flex items-center rounded-full border border-border bg-surface p-0.5 shadow-card';
const segBtn = (on: boolean) =>
  `inline-flex min-h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs transition-colors cursor-pointer ` +
  `focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ` +
  (on ? 'bg-grad font-semibold text-white' : 'text-muted hover:text-fg');

export function LangSwitch() {
  const { lang, t } = useT();
  const [pending, start] = useTransition();
  return (
    <div role="group" aria-label={t.common.language} className={`${seg} ${pending ? 'opacity-60' : ''}`}>
      {(['si', 'en'] as const).map((l) => (
        <button key={l} type="button" aria-pressed={lang === l} lang={l} onClick={() => lang !== l && start(() => setLang(l))} className={`${segBtn(lang === l)} text-[13px]`}>
          {l === 'si' ? 'සිං' : 'EN'}
        </button>
      ))}
    </div>
  );
}

const themes: { value: Theme; icon: IconName; key: 'themeSystem' | 'themeDark' | 'themeLight' }[] = [
  { value: 'system', icon: 'monitor', key: 'themeSystem' },
  { value: 'dark', icon: 'moon', key: 'themeDark' },
  { value: 'light', icon: 'sun', key: 'themeLight' },
];

export function ThemeSwitch() {
  const { theme } = usePrefs();
  const { t } = useT();
  const [pending, start] = useTransition();
  return (
    <div role="group" aria-label={t.common.theme} className={`${seg} ${pending ? 'opacity-60' : ''}`}>
      {themes.map((o) => (
        <button
          key={o.value} type="button" aria-pressed={theme === o.value} aria-label={t.common[o.key]} title={t.common[o.key]}
          onClick={() => theme !== o.value && start(() => setTheme(o.value))} className={segBtn(theme === o.value)}
        >
          <Icon name={o.icon} className="size-3.5" />
        </button>
      ))}
    </div>
  );
}

/** Nav link with an active state for the current section. */
export function NavLink({ href, icon, label, exact, variant = 'top' }: { href: string; icon: IconName; label: string; exact?: boolean; variant?: 'top' | 'side' | 'tab' }) {
  const path = usePathname();
  const on = exact ? path === href : path === href || path.startsWith(`${href}/`);
  const styles = {
    top: `inline-flex min-h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition ${on ? 'bg-surface text-fg shadow-card' : 'text-muted hover:bg-surface-2 hover:text-fg'}`,
    side: `flex min-h-10 items-center gap-2.5 rounded-full px-4 text-sm font-medium transition ${on ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg'}`,
    tab: `flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium ${on ? 'text-accent' : 'text-subtle'}`,
  }[variant];
  return (
    <Link href={href} aria-current={on ? 'page' : undefined} className={`${styles} focus-visible:outline-2 focus-visible:outline-accent`}>
      <Icon name={icon} className={variant === 'tab' ? 'size-5' : 'size-4'} />
      <span className="truncate">{label}</span>
    </Link>
  );
}

/** A <details> dropdown that closes itself after navigation, on Escape and on an outside click. */
export function Dropdown({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const path = usePathname();
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [path]);
  useEffect(() => {
    const close = (e: Event) => {
      const d = ref.current;
      if (!d?.open) return;
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !d.contains(e.target as Node)) d.open = false;
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', close);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', close);
    };
  }, []);
  return <details ref={ref} className={className}>{children}</details>;
}
