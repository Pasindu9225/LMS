import { requireStaff, subjectScope } from '@/lib/auth';
import { sql } from '@/lib/db';
import { getT } from '@/lib/prefs';
import { Badge, Empty, Icon, Label, PageHeader } from '@/app/ui/ui';
import Sources, { loadChunks } from '../Sources';

export default async function LogsPage() {
  const scope = await subjectScope(await requireStaff());
  const [logs, { t }] = await Promise.all([
    sql<{
      id: string; question: string; answer: string; chunk_ids: string[]; created_at: Date; student: string; subject: string | null;
      flag_status: string | null; reply: string | null;
    }[]>`
      select l.id, l.question, l.answer, l.chunk_ids, l.created_at, p.name as student, s.name_en as subject, l.flag_status, l.reply
      from chat_logs l join profiles p on p.id = l.user_id left join subjects s on s.id = l.subject_id
      where ${scope === null} or l.subject_id = any(${sql.array(scope ?? [])}::uuid[])
      order by l.created_at desc limit 100`,
    getT(),
  ]);
  const byId = await loadChunks(logs.flatMap((l) => l.chunk_ids));
  const S = t.staff;

  return (
    <>
      <PageHeader title={S.logs} description={S.logsSub} />
      {scope?.length === 0 && <div className="mb-4"><Empty>{S.noSubjectsAssigned}</Empty></div>}
      {!logs.length && scope?.length !== 0 && <Empty>{S.noLogs}</Empty>}
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {logs.map((l) => (
          <details key={l.id} className="group">
            <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
              <Icon name="arrowRight" className="mt-1 size-3.5 text-subtle transition-transform group-open:rotate-90" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.question}</p>
                <p className="font-mono text-xs text-subtle">
                  {l.created_at.toLocaleString('en-LK', { timeZone: 'Asia/Colombo' })} · {l.student} · {l.subject ?? '—'}
                </p>
              </div>
              {l.flag_status && <Badge tone="warn">{S.flag}: {S[l.flag_status as 'open' | 'answered' | 'dismissed']}</Badge>}
            </summary>
            <div className="space-y-3 px-4 pb-4 pl-11 text-sm">
              <p className="whitespace-pre-wrap text-muted">{l.answer}</p>
              {l.reply && (
                <div className="rounded-lg border border-accent-line bg-accent-soft px-3 py-2">
                  <Label className="mb-0.5">{S.reply}</Label>
                  <p className="whitespace-pre-wrap">{l.reply}</p>
                </div>
              )}
              <Sources ids={l.chunk_ids} byId={byId} />
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
