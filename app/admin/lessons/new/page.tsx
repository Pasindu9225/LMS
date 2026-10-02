import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, requireSubject } from '@/lib/auth';
import { sql, isUuid } from '@/lib/db';
import { editorData } from '@/lib/lessons';
import { getT } from '@/lib/prefs';
import { Icon, PageHeader } from '@/app/ui/ui';
import LessonEditor from '../LessonEditor';

export default async function NewLessonPage({ searchParams }: { searchParams: Promise<{ unit?: string }> }) {
  const user = await requireStaff();
  const { unit } = await searchParams;
  if (!isUuid(unit)) notFound();
  const [u] = await sql<{ subject_id: string }[]>`select subject_id from units where id = ${unit}`;
  if (!u) notFound();
  await requireSubject(user, u.subject_id);
  const [data, { t }] = await Promise.all([editorData(u.subject_id), getT()]);

  return (
    <>
      <Link href={`/admin/lessons?subject=${u.subject_id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <Icon name="arrowLeft" /> {t.staff.allLessons}
      </Link>
      <PageHeader title={t.staff.newLesson} />
      <LessonEditor units={data.units} docs={data.docs} lesson={null} pages={[]} unitId={unit} />
    </>
  );
}
