import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { sql } from '@/lib/db';
import { getT } from '@/lib/prefs';
import { Icon } from '@/app/ui/ui';
import { LangSwitch, NavLink, ThemeSwitch } from '@/app/ui/prefs';

/** Student area: top bar (desktop) + bottom tabs (phones). The page owns the space below. */
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [{ t }, [profile]] = await Promise.all([getT(), sql<{ name: string }[]>`select name from profiles where id = ${user.id}`]);
  const staff = user.role === 'admin' || user.role === 'teacher';
  const nav = [
    { href: '/chat', icon: 'chat' as const, label: t.common.tutor },
    { href: '/learn', icon: 'book' as const, label: t.common.lessons },
    { href: '/classes', icon: 'users' as const, label: t.common.classes },
  ];

  return (
    <div className="flex h-dvh flex-col">
      <header className="relative shrink-0 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
          <Link href="/chat" className="mr-2 flex items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden className="size-4 rounded-[5px] bg-primary" />
            <span className="hidden sm:inline">{t.common.brand}</span>
          </Link>
          <nav aria-label={t.common.menu} className="hidden items-center gap-1 md:flex">
            {nav.map((n) => <NavLink key={n.href} {...n} />)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LangSwitch />
            <ThemeSwitch />
            <details className="relative">
              <summary
                aria-label={t.common.account}
                className="flex size-9 cursor-pointer list-none items-center justify-center rounded-full border border-border-strong bg-surface text-sm font-semibold text-muted hover:text-fg [&::-webkit-details-marker]:hidden"
              >
                {(profile?.name || user.email).slice(0, 1).toUpperCase()}
              </summary>
              <div className="absolute right-0 z-20 mt-2 w-60 rounded-xl border border-border bg-surface p-2 shadow-lg shadow-black/10">
                <div className="px-2 py-1.5">
                  <p className="truncate text-sm font-medium">{profile?.name || '—'}</p>
                  <p className="truncate text-xs text-subtle">{user.email}</p>
                </div>
                {staff && (
                  <Link href="/admin" className="flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
                    <Icon name="shield" /> {t.common.staffArea}
                  </Link>
                )}
                <form action="/auth/signout" method="post">
                  <button className="flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
                    <Icon name="logout" /> {t.common.logout}
                  </button>
                </form>
              </div>
            </details>
          </div>
        </div>
        <div aria-hidden className="accent-rule absolute inset-x-0 bottom-[-1px] opacity-60" />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

      <nav aria-label={t.common.menu} className="flex shrink-0 border-t border-border bg-bg md:hidden">
        {nav.map((n) => <NavLink key={n.href} {...n} variant="tab" />)}
      </nav>
    </div>
  );
}
