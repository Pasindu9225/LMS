import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { learnSubjects } from '@/lib/lessons';
import { getT } from '@/lib/prefs';
import { fmt } from '@/lib/i18n';
import { Empty, Icon, PageHeader } from '@/app/ui/ui';

export default async function LearnPage() {
  const user = await requireUser();
  const [subjects, { lang, t }] = await Promise.all([learnSubjects(user.id), getT()]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader title={t.learn.title} description={t.learn.subtitle} />
      {!subjects.length && <Empty>{t.learn.noSubjects}</Empty>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {subjects.map((s) => {
          const pct = s.total ? Math.round((100 * s.done) / s.total) : 0;
          return (
            <li key={s.id}>
              <Link href={`/learn/${s.id}`} className="group block rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong">
                <div className="flex items-start gap-2">
                  <div className="mr-auto min-w-0">
                    <p className="truncate font-medium">{lang === 'si' ? s.name_si : s.name_en}</p>
                    <p className="mt-0.5 text-sm text-muted">{fmt(t.learn.progress, { done: s.done, total: s.total })}</p>
                  </div>
                  <span className="font-mono text-sm text-subtle">{pct}%</span>
                  <Icon name="arrowRight" className="size-4 text-subtle transition-transform group-hover:translate-x-0.5" />
                </div>
                <div className="mt-4 h-1 rounded-full bg-surface-2" role="progressbar" aria-valuenow={s.done} aria-valuemin={0} aria-valuemax={s.total}>
                  <div className="h-1 rounded-full bg-accent" style={{ width: `${pct}%` }} />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
