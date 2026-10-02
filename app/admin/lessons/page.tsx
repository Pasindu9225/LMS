import Link from 'next/link';
import { requireStaff, subjectScope } from '@/lib/auth';
import { sql } from '@/lib/db';
import { staffOutline } from '@/lib/lessons';
import { getT } from '@/lib/prefs';
import { Badge, ButtonLink, Card, Empty, Icon, PageHeader } from '@/app/ui/ui';

export default async function LessonsPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const scope = await subjectScope(await requireStaff());
  const [subjects, { lang, t }] = await Promise.all([
    sql<{ id: string; name_en: string; name_si: string }[]>`
      select id, name_en, name_si from subjects where ${scope === null} or id = any(${sql.array(scope ?? [])}::uuid[]) order by name_en`,
    getT(),
  ]);
  const S = t.staff;
  if (!subjects.length) return <><PageHeader title={S.lessons} description={S.lessonsSub} /><Empty>{S.noSubjectsAssigned}</Empty></>;
  const { subject: wanted } = await searchParams;
  const subject = subjects.find((s) => s.id === wanted) ?? subjects[0];
  const units = await staffOutline(subject.id);

  return (
    <>
      <PageHeader title={S.lessons} description={S.lessonsSub} />
      <nav aria-label={S.subjects} className="mb-6 flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1">
        {subjects.map((s) => (
          <Link
            key={s.id} href={`/admin/lessons?subject=${s.id}`} aria-current={s.id === subject.id ? 'page' : undefined}
            className={`rounded-md px-3 py-1.5 text-sm ${s.id === subject.id ? 'bg-surface-2 font-medium text-fg' : 'text-muted hover:text-fg'}`}
          >{lang === 'si' ? s.name_si : s.name_en}</Link>
        ))}
      </nav>
      {!units.length && <Empty>{S.noUnits}</Empty>}
      <div className="space-y-4">
        {units.map((u) => (
          <Card key={u.id}>
            <div className="mb-2 flex items-center gap-3">
              <h2 className="mr-auto font-medium">{lang === 'si' ? u.name_si : u.name_en}</h2>
              <ButtonLink href={`/admin/lessons/new?unit=${u.id}`} variant="secondary" size="sm"><Icon name="plus" /> {S.newLesson}</ButtonLink>
            </div>
            {!u.lessons.length ? <p className="text-sm text-subtle">{t.learn.noLessons}</p> : (
              <ol className="divide-y divide-border">
                {u.lessons.map((l) => (
                  <li key={l.id}>
                    <Link href={`/admin/lessons/${l.id}`} className="group flex min-h-11 items-center gap-3 py-2 text-sm">
                      <span className="w-8 font-mono text-xs text-subtle">{l.sort_order}</span>
                      <span className="mr-auto group-hover:text-accent">{l.title}</span>
                      <Badge tone={l.published ? 'ok' : 'neutral'}>{l.published ? S.published : S.draft}</Badge>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
