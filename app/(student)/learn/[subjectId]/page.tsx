import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { isUuid } from '@/lib/db';
import { subjectOutline } from '@/lib/lessons';
import { groupPapers } from '@/lib/papers';
import { quizUnits, recentQuizzes } from '@/lib/practice';
import { colomboDate } from '@/lib/text';
import { getT } from '@/lib/prefs';
import { fmt } from '@/lib/i18n';
import { Badge, Card, Empty, Icon, Label, PageHeader } from '@/app/ui/ui';
import QuizMeButton from '../QuizMeButton';

const pdf = (id: string) => `/api/pdf/${id}?page=1`;

// Quiz generation runs in a server action on this page and can take ~30 s when Gemini is slow.
export const maxDuration = 60;

export default async function SubjectPage({ params }: { params: Promise<{ subjectId: string }> }) {
  const user = await requireUser();
  const { subjectId } = await params;
  if (!isUuid(subjectId)) notFound();
  const [outline, { lang, t }] = await Promise.all([subjectOutline(subjectId, user.id), getT()]);
  if (!outline) notFound();
  const years = groupPapers(outline.papers);
  const [units, recent] = await Promise.all([quizUnits(subjectId), recentQuizzes(user.id, subjectId)]);
  const name = (x: { name_si: string; name_en: string }) => (lang === 'si' ? x.name_si : x.name_en);
  const total = outline.units.reduce((n, u) => n + u.lessons.length, 0);
  const done = outline.units.reduce((n, u) => n + u.lessons.filter((l) => l.done).length, 0);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/learn" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <Icon name="arrowLeft" /> {t.learn.title}
      </Link>
      <PageHeader eyebrow={t.chat.subject} title={name(outline.subject)} description={total ? fmt(t.learn.progress, { done, total }) : undefined} />
      {total > 0 && (
        <div className="-mt-3 mb-8 h-1.5 rounded-full bg-surface-2"><div className="h-1.5 rounded-full bg-grad" style={{ width: `${(100 * done) / total}%` }} /></div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="space-y-3">
          {!outline.units.length && <Empty>{t.learn.noLessons}</Empty>}
          {outline.units.map((u) => {
            const d = u.lessons.filter((l) => l.done).length;
            return (
              <Card key={u.id}>
                <div className="mb-2 flex items-baseline gap-2">
                  <h2 className="mr-auto font-medium">{name(u)}</h2>
                  <span className="font-mono text-xs text-subtle">{fmt(t.learn.unitDone, { done: d, total: u.lessons.length })}</span>
                </div>
                <ol className="divide-y divide-border">
                  {u.lessons.map((l) => (
                    <li key={l.id}>
                      <Link href={`/learn/lesson/${l.id}`} className="group flex min-h-11 items-center gap-3 py-2 text-sm">
                        <span
                          aria-hidden
                          className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${l.done ? 'border-transparent bg-grad text-white' : 'border-border-strong'}`}
                        >
                          {l.done && <Icon name="check" className="size-3" />}
                        </span>
                        <span className="sr-only">{l.done ? t.learn.isDone : t.learn.notDone}:</span>
                        <span className="mr-auto group-hover:text-accent">{l.title}</span>
                        <Icon name="arrowRight" className="size-3.5 text-subtle" />
                      </Link>
                    </li>
                  ))}
                </ol>
              </Card>
            );
          })}
        </section>

        <aside className="space-y-6">
          <section>
            <Label className="mb-2">{t.quiz.practice}</Label>
            <Card className="space-y-3">
              <p className="text-sm text-muted">{t.quiz.practiceSub}</p>
              {!units.length && <p className="text-sm text-subtle">{t.quiz.notAvailable}</p>}
              <ul className="space-y-2">
                {units.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center gap-2">
                    <span className="mr-auto text-sm">{name(u)}</span>
                    <QuizMeButton unitId={u.id} />
                  </li>
                ))}
              </ul>
              {recent.length > 0 && (
                <div className="border-t border-border pt-3">
                  <Label className="mb-1">{t.quiz.recent}</Label>
                  <ul className="space-y-1 text-sm">
                    {recent.map((r) => (
                      <li key={r.id}>
                        <Link href={`/learn/quiz/${r.id}`} className="flex items-center gap-2 rounded-md py-1 hover:text-accent">
                          <span className="font-mono text-xs text-subtle">{colomboDate(r.created_at.toISOString())}</span>
                          <span className="mr-auto truncate">{name({ name_si: r.unit_si, name_en: r.unit_en })}</span>
                          {r.score === null ? <Badge>{t.quiz.notSubmitted}</Badge> : <Badge tone="ok">{r.score}/{r.total}</Badge>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </section>

          <section>
            <Label className="mb-2">{t.learn.pastPapers}</Label>
            <Card className="p-0">
              {!years.length && <p className="p-4 text-sm text-subtle">{t.learn.noPapers}</p>}
              <ul className="divide-y divide-border">
                {years.map((y) => (
                  <li key={y.year ?? 'unknown'} className="flex gap-3 px-4 py-3 text-sm">
                    <span className="w-12 font-mono text-subtle">{y.year ?? '—'}</span>
                    <div className="min-w-0 flex-1 space-y-1">
                      {y.papers.map((d) => (
                        <a key={d.id} href={pdf(d.id)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-accent">
                          <span className="truncate">{d.title}</span><Icon name="external" className="size-3 text-subtle" />
                        </a>
                      ))}
                      {y.schemes.map((d) => (
                        <a key={d.id} href={pdf(d.id)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-muted hover:text-accent">
                          <span className="truncate">{t.learn.scheme}: {d.title}</span><Icon name="external" className="size-3 text-subtle" />
                        </a>
                      ))}
                      {!y.papers.length && !y.schemes.length && <span className="text-subtle">—</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        </aside>
      </div>
    </main>
  );
}
