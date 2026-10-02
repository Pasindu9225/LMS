import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { isUuid } from '@/lib/db';
import { lessonForStudent } from '@/lib/lessons';
import { getT } from '@/lib/prefs';
import { fmt } from '@/lib/i18n';
import Markdown from '@/app/Markdown';
import { ButtonLink, Card, Icon, Label, btn } from '@/app/ui/ui';
import { setDoneAction } from '../../actions';

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [l, { lang, t }] = await Promise.all([lessonForStudent(id, user.id), getT()]);
  if (!l) notFound();
  const si = lang === 'si';

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <nav aria-label={t.common.breadcrumb}className="mb-4 flex flex-wrap items-center gap-1.5 text-sm text-muted">
        <Link href="/learn" className="hover:text-fg">{t.learn.title}</Link>
        <span aria-hidden>/</span>
        <Link href={`/learn/${l.subject_id}`} className="hover:text-fg">{si ? l.subject_si : l.subject_en}</Link>
        <span aria-hidden>/</span>
        <span className="text-subtle">{si ? l.unit_si : l.unit_en}</span>
      </nav>
      <h1 className="text-3xl font-semibold tracking-tight">{l.title}</h1>

      {l.youtube_id && (
        <div className="mt-6 overflow-hidden rounded-xl border border-border bg-surface-2">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${l.youtube_id}`} title={l.title} className="aspect-video w-full"
            allow="encrypted-media; picture-in-picture" allowFullScreen
          />
        </div>
      )}
      {l.body && <div className="mt-6 text-[15px]"><Markdown>{l.body}</Markdown></div>}

      {l.pages.length > 0 && (
        <Card className="mt-8">
          <Label className="mb-2">{t.learn.textbook}</Label>
          <ul className="space-y-1.5 text-sm">
            {l.pages.map((p, i) => (
              <li key={i}>
                <a href={`/api/pdf/${p.document_id}?page=${p.page_from}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-accent">
                  <Icon name="file" className="size-3.5 text-subtle" />
                  {p.title} · <span className="font-mono text-xs text-muted">
                    {p.page_to > p.page_from ? fmt(t.learn.pagesRange, { from: p.page_from, to: p.page_to }) : fmt(t.learn.pageOne, { n: p.page_from })}
                  </span>
                  <Icon name="external" className="size-3 text-subtle" />
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-6">
        <form action={setDoneAction}>
          <input type="hidden" name="lessonId" value={l.id} />
          <input type="hidden" name="done" value={l.done ? '0' : '1'} />
          <button className={btn(l.done ? 'secondary' : 'primary')}>
            <Icon name="check" /> {l.done ? t.learn.doneUndo : t.learn.markDone}
          </button>
        </form>
        <span className="ml-auto flex gap-2">
          {l.prev_id && <ButtonLink href={`/learn/lesson/${l.prev_id}`} variant="ghost"><Icon name="arrowLeft" /> {t.learn.prev}</ButtonLink>}
          {l.next_id && <ButtonLink href={`/learn/lesson/${l.next_id}`} variant="secondary">{t.learn.next} <Icon name="arrowRight" /></ButtonLink>}
        </span>
      </div>
    </main>
  );
}
