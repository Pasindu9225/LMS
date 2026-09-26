import { requireAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';

export default async function LogsPage() {
  await requireAdmin();
  const logs = await sql<{
    id: string; question: string; answer: string; chunk_ids: string[]; created_at: Date; student: string; subject: string | null;
  }[]>`
    select l.id, l.question, l.answer, l.chunk_ids, l.created_at, p.name as student, s.name_en as subject
    from chat_logs l join profiles p on p.id = l.user_id left join subjects s on s.id = l.subject_id
    order by l.created_at desc limit 100`;
  const ids = [...new Set(logs.flatMap((l) => l.chunk_ids))];
  const chunks = ids.length ? await sql<{ id: string; page_no: number; content: string; title: string; document_id: string }[]>`
    select c.id, c.page_no, c.content, d.title, c.document_id
    from chunks c join documents d on d.id = c.document_id where c.id = any(${sql.array(ids)}::uuid[])` : [];
  const byId = new Map(chunks.map((c) => [c.id, c]));

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Recent chat questions</h1>
      {logs.map((l) => (
        <details key={l.id} className="rounded border p-3 text-sm">
          <summary className="cursor-pointer">
            <span className="text-gray-500">{l.created_at.toLocaleString('en-LK', { timeZone: 'Asia/Colombo' })} · {l.student} · {l.subject ?? '—'}</span>
            <div className="font-medium">{l.question}</div>
          </summary>
          <p className="mt-2 whitespace-pre-wrap">{l.answer}</p>
          <ol className="mt-2 space-y-1 border-t pt-2 text-xs text-gray-700">
            {l.chunk_ids.map((id, i) => {
              const c = byId.get(id);
              return (
                <li key={id}>
                  [{i + 1}] {c ? (
                    <><a href={`/admin/documents/${c.document_id}`} className="text-blue-600">{c.title}, page {c.page_no}</a>: {c.content.slice(0, 200)}…</>
                  ) : '(chunk since re-indexed)'}
                </li>
              );
            })}
          </ol>
        </details>
      ))}
    </div>
  );
}
