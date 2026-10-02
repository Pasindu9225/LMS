import { requireUser } from '@/lib/auth';
import { listStudentClasses } from '@/lib/classes';
import { colomboDate } from '@/lib/text';
import { getT } from '@/lib/prefs';
import { fmt } from '@/lib/i18n';
import { Badge, Card, Empty, Label, PageHeader } from '@/app/ui/ui';
import ConfirmButton from '@/app/ui/ConfirmButton';
import { leaveClassAction } from './actions';
import JoinForm from './JoinForm';

export default async function ClassesPage() {
  const user = await requireUser();
  const [classes, { lang, t }] = await Promise.all([listStudentClasses(user.id), getT()]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader title={t.classes.title} description={t.classes.subtitle} />
      <Card className="mb-8"><JoinForm /></Card>
      {!classes.length && <Empty>{t.classes.none}</Empty>}
      <div className="space-y-4">
        {classes.map((c) => (
          <Card key={c.id} className={c.archived ? 'opacity-60' : ''}>
            <div className="flex flex-wrap items-start gap-2">
              <div className="mr-auto min-w-0">
                <h2 className="font-medium">{c.name}</h2>
                <p className="text-sm text-muted">
                  {lang === 'si' ? c.subject_si : c.subject_en} · {t.classes.teacher}: {c.teacher ?? '—'}
                  {c.batch_year && <span className="font-mono"> · {c.batch_year}</span>}
                </p>
              </div>
              {c.archived && <Badge>{t.classes.archived}</Badge>}
              <form action={leaveClassAction}>
                <input type="hidden" name="classId" value={c.id} />
                <ConfirmButton message={fmt(t.classes.confirmLeave, { name: c.name })} className="cursor-pointer text-xs text-subtle hover:text-danger">
                  {t.classes.leave}
                </ConfirmButton>
              </form>
            </div>
            <div className="mt-3 space-y-2">
              {c.posts.map((p) => (
                <div key={p.id} className="rounded-xl border-l-2 border-accent bg-surface-2 px-3 py-2 text-sm">
                  <Label className="mb-0.5 normal-case tracking-normal">{colomboDate(p.created_at)}</Label>
                  <p className="whitespace-pre-wrap">{p.body}</p>
                </div>
              ))}
              {!c.posts.length && <p className="text-sm text-subtle">{t.classes.noPosts}</p>}
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}
