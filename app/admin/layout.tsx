import Link from 'next/link';
import { requireStaff, subjectScope } from '@/lib/auth';
import { sql } from '@/lib/db';
import { getT } from '@/lib/prefs';
import { Badge, Icon, type IconName } from '@/app/ui/ui';
import { Dropdown, LangSwitch, NavLink, ThemeSwitch } from '@/app/ui/prefs';

type Item = { href: string; icon: IconName; label: string; count?: number };

/** Staff area: grouped left sidebar (desktop), a menu on phones. Teachers don't see admin-only items. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const admin = user.role === 'admin';
  const scope = await subjectScope(user);
  const [{ t }, [{ open }]] = await Promise.all([
    getT(),
    sql<{ open: number }[]>`
      select count(*)::int as open from chat_logs
      where flag_status = 'open' and (${scope === null} or subject_id = any(${sql.array(scope ?? [])}::uuid[]))`,
  ]);
  const S = t.staff;
  const groups: { label: string; items: Item[] }[] = [
    { label: S.groupContent, items: [
      { href: '/admin/documents', icon: 'file', label: S.documents },
      { href: '/admin/lessons', icon: 'book', label: S.lessons },
      ...(admin ? [{ href: '/admin/subjects', icon: 'layers' as const, label: S.subjects }] : []),
    ] },
    { label: S.groupStudents, items: [
      { href: '/admin/flags', icon: 'flag', label: S.flags, count: open },
      { href: '/admin/classes', icon: 'users', label: S.classes },
      { href: '/admin/logs', icon: 'list', label: S.logs },
    ] },
    ...(admin ? [{ label: S.groupAdmin, items: [{ href: '/admin/users', icon: 'shield' as const, label: S.users }] }] : []),
  ];

  const nav = (
    <nav aria-label={t.common.menu} className="space-y-5">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="caps mb-1.5 px-3 text-subtle">{g.label}</p>
          <div className="space-y-0.5">
            {g.items.map((i) => (
              <div key={i.href} className="relative">
                <NavLink href={i.href} icon={i.icon} label={i.label} variant="side" />
                {!!i.count && <Badge tone="warn" className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">{i.count}</Badge>}
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="border-t border-border pt-4">
        <NavLink href="/chat" icon="chat" label={t.common.studentView} variant="side" />
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-4">
          <Dropdown className="relative lg:hidden">
            <summary aria-label={t.common.menu} className="flex size-9 cursor-pointer list-none items-center justify-center rounded-lg border border-border-strong [&::-webkit-details-marker]:hidden">
              <Icon name="menu" />
            </summary>
            <div className="absolute left-0 z-30 mt-2 w-64 rounded-xl border border-border bg-surface p-3 shadow-lg shadow-black/10">{nav}</div>
          </Dropdown>
          <Link href="/admin" className="flex items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden className="size-4 rounded-[5px] bg-primary" />
            <span className="hidden sm:inline">{t.common.brand}</span>
          </Link>
          <Badge>{admin ? S.admin : S.teacher}</Badge>
          <div className="ml-auto flex items-center gap-2">
            <LangSwitch />
            <ThemeSwitch />
            <form action="/auth/signout" method="post">
              <button aria-label={t.common.logout} title={t.common.logout} className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg">
                <Icon name="logout" />
              </button>
            </form>
          </div>
        </div>
        <div aria-hidden className="accent-rule opacity-60" />
      </header>
      <div className="flex">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r border-border p-3 lg:block">{nav}</aside>
        <main className="min-w-0 flex-1 px-4 py-8 lg:px-8">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
