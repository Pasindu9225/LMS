import { notFound } from 'next/navigation';
import { requireStaff, requireDocument } from '@/lib/auth';
import { sql, isUuid } from '@/lib/db';
import { getPrefs } from '@/lib/prefs';
import AutoRefresh from '@/app/admin/AutoRefresh';
import Reviewer from './Reviewer';

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireDocument(user, id);
  const { lang } = await getPrefs();
  const [doc] = await sql<{
    id: string; title: string; status: string; error: string | null; subject_id: string;
    subject: string; page_count: number; pages_done: number;
  }[]>`
    select d.id, d.title, d.status, d.error, d.subject_id, ${lang === 'si' ? sql`s.name_si` : sql`s.name_en`} as subject, d.page_count, d.pages_done
    from documents d join subjects s on s.id = d.subject_id where d.id = ${id}`;
  if (!doc) notFound();
  const pages = await sql<{ page_no: number; text: string; unit_id: string | null; ocr_failed: boolean; reviewed: boolean }[]>`
    select page_no, text, unit_id, ocr_failed, reviewed from pages where document_id = ${id} order by page_no`;
  const units = await sql<{ id: string; name_en: string; name_si: string }[]>`
    select id, name_en, name_si from units where subject_id = ${doc.subject_id} order by sort_order, name_en`;

  return (
    <>
      <Reviewer doc={{ ...doc }} pages={[...pages]} units={[...units]} />
      {(doc.status === 'queued' || doc.status === 'processing') && <AutoRefresh />}
    </>
  );
}
