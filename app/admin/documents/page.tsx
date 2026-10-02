import Link from 'next/link';
import { requireStaff, subjectScope } from '@/lib/auth';
import { sql } from '@/lib/db';
import { getT } from '@/lib/prefs';
import { docStatus, docType } from '@/lib/i18n';
import { Badge, Card, Empty, PageHeader, statusTone } from '@/app/ui/ui';
import UploadForm from './UploadForm';
import AutoRefresh from '@/app/admin/AutoRefresh';

export default async function DocumentsPage() {
  const scope = await subjectScope(await requireStaff());
  const { lang, t } = await getT();
  const S = t.staff;
  const mine = sql`(${scope === null} or s.id = any(${sql.array(scope ?? [])}::uuid[]))`;
  const nm = lang === 'si' ? sql`s.name_si` : sql`s.name_en`;
  const subjects = await sql<{ id: string; name: string }[]>`select s.id, ${nm} as name from subjects s where ${mine} order by 2`;
  const docs = await sql<{
    id: string; title: string; doc_type: string; year: number | null; status: string;
    page_count: number; pages_done: number; error: string | null; subject: string;
  }[]>`
    select d.id, d.title, d.doc_type, d.year, d.status, d.page_count, d.pages_done, d.error, ${nm} as subject
    from documents d join subjects s on s.id = d.subject_id where ${mine} order by d.created_at desc`;
  const active = docs.some((d) => d.status === 'queued' || d.status === 'processing');

  return (
    <>
      <PageHeader title={S.documents} description={S.docsSub} />
      {subjects.length
        ? <Card className="mb-6"><UploadForm subjects={[...subjects]} /></Card>
        : <Empty>{scope === null ? S.addSubjectFirst : S.noSubjectsAssigned}</Empty>}
      {docs.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                {[S.title, S.subject, S.type, S.status, S.progress].map((h) => <th key={h} className="caps px-4 py-2.5 font-normal text-subtle">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {docs.map((d) => (
                <tr key={d.id} className="hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link href={`/admin/documents/${d.id}`} className="font-medium hover:text-accent">{d.title}</Link>
                    {d.year && <span className="ml-1.5 font-mono text-xs text-subtle">{d.year}</span>}
                    {d.error && <p className="mt-0.5 text-xs text-danger">{d.error}</p>}
                  </td>
                  <td className="px-4 py-3 text-muted">{d.subject}</td>
                  <td className="px-4 py-3 text-muted">{docType(t, d.doc_type)}</td>
                  <td className="px-4 py-3"><Badge tone={statusTone(d.status)}>{docStatus(t, d.status)}</Badge></td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    {d.page_count ? (d.status === 'processing' || d.status === 'queued' ? `${d.pages_done}/${d.page_count}` : d.page_count) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : subjects.length > 0 && <Empty>{S.noDocs}</Empty>}
      {active && <AutoRefresh />}
    </>
  );
}
