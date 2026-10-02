import { requireStaff, subjectScope } from '@/lib/auth';
import { sql } from '@/lib/db';
import Sources, { loadChunks } from '../Sources';

export default async function LogsPage() {
  const scope = await subjectScope(await requireStaff());
  const logs = await sql<{
    id: string; question: string; answer: string; chunk_ids: string[]; created_at: Date; student: string; subject: string | null;
    flag_status: string | null; reply: string | null;
  }[]>`
    select l.id, l.question, l.answer, l.chunk_ids, l.created_at, p.name as student, s.name_en as subject, l.flag_status, l.reply
    from chat_logs l join profiles p on p.id = l.user_id left join subjects s on s.id = l.subject_id
    where ${scope === null} or l.subject_id = any(${sql.array(scope ?? [])}::uuid[])
    order by l.created_at desc limit 100`;
  const byId = await loadChunks(logs.flatMap((l) => l.chunk_ids));

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Recent chat questions</h1>
      {scope?.length === 0 && <p className="text-gray-600">No subjects assigned yet. Ask an admin.</p>}
      {logs.map((l) => (
        <details key={l.id} className="rounded border p-3 text-sm">
          <summary className="cursor-pointer">
            <span className="text-gray-500">{l.created_at.toLocaleString('en-LK', { timeZone: 'Asia/Colombo' })} · {l.student} · {l.subject ?? '—'}</span>
            {l.flag_status && <span className="ml-2 rounded bg-amber-100 px-1 text-xs text-amber-800">flag: {l.flag_status}</span>}
            <div className="font-medium">{l.question}</div>
          </summary>
          <p className="mt-2 whitespace-pre-wrap">{l.answer}</p>
          {l.reply && <p className="mt-2 whitespace-pre-wrap rounded bg-amber-50 p-2"><b>Reply:</b> {l.reply}</p>}
          <Sources ids={l.chunk_ids} byId={byId} />
        </details>
      ))}
    </div>
  );
}
