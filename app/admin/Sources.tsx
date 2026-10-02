import { sql } from '@/lib/db';

type Chunk = { id: string; page_no: number; content: string; title: string; document_id: string };

/** Chunk details for many log rows in one query. */
export async function loadChunks(ids: string[]): Promise<Map<string, Chunk>> {
  const unique = [...new Set(ids)];
  const rows = unique.length ? await sql<Chunk[]>`
    select c.id, c.page_no, c.content, d.title, c.document_id
    from chunks c join documents d on d.id = c.document_id where c.id = any(${sql.array(unique)}::uuid[])` : [];
  return new Map(rows.map((c) => [c.id, c]));
}

/** The retrieved sources of one answer, numbered as the answer cites them. */
export default function Sources({ ids, byId }: { ids: string[]; byId: Map<string, Chunk> }) {
  return (
    <ol className="mt-2 space-y-1 border-t pt-2 text-xs text-gray-700">
      {ids.map((id, i) => {
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
  );
}
