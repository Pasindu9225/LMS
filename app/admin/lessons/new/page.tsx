import { notFound } from 'next/navigation';
import { requireStaff, requireSubject } from '@/lib/auth';
import { sql, isUuid } from '@/lib/db';
import { editorData } from '@/lib/lessons';
import LessonEditor from '../LessonEditor';

export default async function NewLessonPage({ searchParams }: { searchParams: Promise<{ unit?: string }> }) {
  const user = await requireStaff();
  const { unit } = await searchParams;
  if (!isUuid(unit)) notFound();
  const [u] = await sql<{ subject_id: string }[]>`select subject_id from units where id = ${unit}`;
  if (!u) notFound();
  await requireSubject(user, u.subject_id);
  const data = await editorData(u.subject_id);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">New lesson</h1>
      <LessonEditor units={data.units} docs={data.docs} lesson={null} pages={[]} unitId={unit} />
    </div>
  );
}
