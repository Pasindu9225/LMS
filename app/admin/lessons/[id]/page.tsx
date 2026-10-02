import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, requireLesson } from '@/lib/auth';
import { isUuid } from '@/lib/db';
import { editorData } from '@/lib/lessons';
import { deleteLessonAction } from '../../lesson-actions';
import ConfirmButton from '../../ConfirmButton';
import LessonEditor from '../LessonEditor';

export default async function EditLessonPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireStaff();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { subject_id, unit_id } = await requireLesson(user, id);
  const [data, { saved }] = await Promise.all([editorData(subject_id, id), searchParams]);
  if (!data.lesson) notFound();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-semibold">Edit lesson</h1>
        {saved && <span role="status" className="text-sm text-green-700">Saved.</span>}
        {data.lesson.published && <Link href={`/learn/lesson/${id}`} className="text-sm text-blue-600">View as student</Link>}
        <Link href={`/admin/lessons?subject=${subject_id}`} className="text-sm text-blue-600">← All lessons</Link>
      </div>
      <LessonEditor key={id} units={data.units} docs={data.docs} lesson={data.lesson} pages={data.pages} unitId={unit_id} />
      <form action={deleteLessonAction} className="border-t pt-3">
        <input type="hidden" name="id" value={id} />
        <ConfirmButton message="Delete this lesson? Students' progress on it is deleted too." className="text-sm text-red-600 underline">
          Delete lesson
        </ConfirmButton>
      </form>
    </div>
  );
}
