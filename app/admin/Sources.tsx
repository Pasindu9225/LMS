import Link from 'next/link';
import { sql } from '@/lib/db';
import { getT } from '@/lib/prefs';

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
export default async function Sources({ ids, byId }: { ids: string[]; byId: Map<string, Chunk> }) {
  if (!ids.length) return null;
  const { t } = await getT();
  return (
    <ol className="space-y-1.5 border-t border-dashed border-border-strong pt-3 text-xs">
      {ids.map((id, i) => {
        const c = byId.get(id);
        return (
          <li key={id} className="flex gap-2">
            <span className="font-mono text-subtle">[{i + 1}]</span>
            {c ? (
              <span className="min-w-0 text-muted">
                <Link href={`/admin/documents/${c.document_id}`} className="font-medium text-fg hover:text-accent">
                  {c.title} · {t.common.page} {c.page_no}
                </Link>{' '}
                {c.content.slice(0, 200)}…
              </span>
            ) : <span className="text-subtle">{t.staff.chunkGone}</span>}
          </li>
        );
      })}
    </ol>
  );
}
