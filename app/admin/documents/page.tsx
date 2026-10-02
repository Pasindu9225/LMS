import Link from 'next/link';
import { requireStaff, subjectScope } from '@/lib/auth';
import { sql } from '@/lib/db';
import UploadForm from './UploadForm';
import AutoRefresh from '@/app/admin/AutoRefresh';

export default async function DocumentsPage() {
  const scope = await subjectScope(await requireStaff());
  const mine = sql`(${scope === null} or s.id = any(${sql.array(scope ?? [])}::uuid[]))`;
  const subjects = await sql<{ id: string; name_en: string }[]>`select s.id, s.name_en from subjects s where ${mine} order by s.name_en`;
  const docs = await sql<{
    id: string; title: string; doc_type: string; year: number | null; status: string;
    page_count: number; pages_done: number; error: string | null; subject: string;
  }[]>`
    select d.id, d.title, d.doc_type, d.year, d.status, d.page_count, d.pages_done, d.error, s.name_en as subject
    from documents d join subjects s on s.id = d.subject_id where ${mine} order by d.created_at desc`;
  const active = docs.some((d) => d.status === 'queued' || d.status === 'processing');

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Documents</h1>
      {subjects.length ? <UploadForm subjects={[...subjects]} />
        : <p>{scope === null ? 'Add a subject first.' : 'No subjects assigned yet. Ask an admin.'}</p>}
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b"><th>Title</th><th>Subject</th><th>Type</th><th>Status</th><th>Progress</th><th /></tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id} className="border-b align-top">
              <td className="py-2">{d.title}{d.year ? ` (${d.year})` : ''}</td>
              <td>{d.subject}</td>
              <td>{d.doc_type}</td>
              <td>
                {d.status}
                {d.error && <div className="text-xs text-red-600">{d.error}</div>}
              </td>
              <td>{d.page_count ? `${d.pages_done}/${d.page_count} pages` : '–'}</td>
              <td><Link href={`/admin/documents/${d.id}`} className="text-blue-600">Open</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
      {active && <AutoRefresh />}
    </div>
  );
}
