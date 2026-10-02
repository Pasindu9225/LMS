import Link from 'next/link';
import { requireStaff, subjectScope } from '@/lib/auth';
import { listFlags } from '@/lib/flags';
import type { FlagStatus } from '@/lib/text';
import { replyToFlag, dismissFlagAction } from '../actions';
import Sources, { loadChunks } from '../Sources';

const STATUSES: FlagStatus[] = ['open', 'answered', 'dismissed'];
const when = (d: Date) => d.toLocaleString('en-LK', { timeZone: 'Asia/Colombo' });

export default async function FlagsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireStaff();
  const scope = await subjectScope(user);
  const { status: raw } = await searchParams;
  const status = STATUSES.find((s) => s === raw) ?? 'open';
  const flags = await listFlags(status, scope);
  const byId = await loadChunks(flags.flatMap((f) => f.chunk_ids));

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Flagged answers</h1>
      <nav className="flex gap-3 text-sm">
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/flags?status=${s}`} className={s === status ? 'font-semibold' : 'text-blue-600'}>{s}</Link>
        ))}
      </nav>
      {scope?.length === 0 && <p className="text-gray-600">No subjects assigned yet. Ask an admin.</p>}
      {!flags.length && <p className="text-gray-600">No {status} flags.</p>}
      {flags.map((f) => (
        <div key={f.id} className="space-y-2 rounded border p-3 text-sm">
          <p className="text-gray-500">{when(f.flagged_at)} · {f.student} · {f.subject ?? '—'}</p>
          <p className="font-medium">{f.question}</p>
          <p className="whitespace-pre-wrap rounded bg-gray-50 p-2">{f.answer}</p>
          {f.flag_note && <p className="whitespace-pre-wrap"><b>Student note:</b> {f.flag_note}</p>}
          <Sources ids={f.chunk_ids} byId={byId} />
          {status !== 'dismissed' && (
            <form action={replyToFlag} className="space-y-2">
              <input type="hidden" name="id" value={f.id} />
              <textarea
                name="reply" required maxLength={4000} rows={3} defaultValue={f.reply ?? ''}
                placeholder="Reply to the student (shown under their answer)" className="w-full rounded border p-2"
              />
              <div className="flex items-center gap-3">
                <button className="rounded bg-blue-600 px-3 py-1 text-white">{f.reply ? 'Update reply' : 'Send reply'}</button>
                {f.replied_at && <span className="text-xs text-gray-500">Replied {when(f.replied_at)}</span>}
              </div>
            </form>
          )}
          {status === 'open' && (
            <form action={dismissFlagAction}>
              <input type="hidden" name="id" value={f.id} />
              <button className="text-gray-600 underline">Dismiss</button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}
