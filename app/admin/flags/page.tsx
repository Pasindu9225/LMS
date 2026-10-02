import Link from 'next/link';
import { requireStaff, subjectScope } from '@/lib/auth';
import { listFlags } from '@/lib/flags';
import type { FlagStatus } from '@/lib/text';
import { getT } from '@/lib/prefs';
import { fmt } from '@/lib/i18n';
import { Card, Empty, Icon, Label, PageHeader, Textarea, btn } from '@/app/ui/ui';
import { replyToFlag, dismissFlagAction } from '../actions';
import Sources, { loadChunks } from '../Sources';

const STATUSES: FlagStatus[] = ['open', 'answered', 'dismissed'];
const when = (d: Date) => d.toLocaleString('en-LK', { timeZone: 'Asia/Colombo' });

export default async function FlagsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireStaff();
  const scope = await subjectScope(user);
  const { status: raw } = await searchParams;
  const status = STATUSES.find((s) => s === raw) ?? 'open';
  const [flags, { t }] = await Promise.all([listFlags(status, scope), getT()]);
  const byId = await loadChunks(flags.flatMap((f) => f.chunk_ids));
  const S = t.staff;

  return (
    <>
      <PageHeader title={S.flags} description={S.flagsSub} />
      <nav aria-label={S.status} className="mb-6 inline-flex rounded-lg border border-border bg-surface p-1">
        {STATUSES.map((s) => (
          <Link
            key={s} href={`/admin/flags?status=${s}`} aria-current={s === status ? 'page' : undefined}
            className={`min-h-8 rounded-md px-3 py-1.5 text-sm ${s === status ? 'bg-surface-2 font-medium text-fg' : 'text-muted hover:text-fg'}`}
          >{S[s]}</Link>
        ))}
      </nav>
      {scope?.length === 0 && <div className="mb-4"><Empty>{S.noSubjectsAssigned}</Empty></div>}
      {!flags.length && <Empty>{fmt(S.noFlags, { status: S[status].toLowerCase() })}</Empty>}
      <div className="space-y-4">
        {flags.map((f) => (
          <Card key={f.id} className="space-y-3">
            <p className="font-mono text-xs text-subtle">{when(f.flagged_at)} · {f.student} · {f.subject ?? '—'}</p>
            <p className="font-medium">{f.question}</p>
            <p className="whitespace-pre-wrap rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">{f.answer}</p>
            {f.flag_note && (
              <div className="rounded-lg border-l-2 border-warn bg-warn-soft px-3 py-2 text-sm">
                <Label className="mb-0.5">{S.studentNote}</Label>
                <p className="whitespace-pre-wrap">{f.flag_note}</p>
              </div>
            )}
            <Sources ids={f.chunk_ids} byId={byId} />
            {status !== 'dismissed' && (
              <form action={replyToFlag} className="space-y-2 border-t border-border pt-3">
                <input type="hidden" name="id" value={f.id} />
                <Textarea name="reply" required maxLength={4000} rows={3} defaultValue={f.reply ?? ''} placeholder={S.replyPh} aria-label={S.reply} />
                <div className="flex flex-wrap items-center gap-2">
                  <button className={btn('primary', 'sm')}><Icon name="send" /> {f.reply ? S.updateReply : S.sendReply}</button>
                  {f.replied_at && <span className="font-mono text-xs text-subtle">{fmt(S.replied, { at: when(f.replied_at) })}</span>}
                </div>
              </form>
            )}
            {status === 'open' && (
              <form action={dismissFlagAction}>
                <input type="hidden" name="id" value={f.id} />
                <button className={btn('ghost', 'sm')}>{S.dismiss}</button>
              </form>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
