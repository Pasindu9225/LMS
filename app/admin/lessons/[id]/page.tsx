import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, requireLesson } from '@/lib/auth';
import { isUuid } from '@/lib/db';
import { editorData } from '@/lib/lessons';
import { getT } from '@/lib/prefs';
import { ButtonLink, Icon, Notice, PageHeader } from '@/app/ui/ui';
import ConfirmButton from '@/app/ui/ConfirmButton';
import { deleteLessonAction } from '../../lesson-actions';
import LessonEditor from '../LessonEditor';

export default async function EditLessonPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireStaff();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { subject_id, unit_id } = await requireLesson(user, id);
  const [data, { saved }, { t }] = await Promise.all([editorData(subject_id, id), searchParams, getT()]);
  if (!data.lesson) notFound();
  const S = t.staff;

  return (
    <>
      <Link href={`/admin/lessons?subject=${subject_id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <Icon name="arrowLeft" /> {S.allLessons}
      </Link>
      <PageHeader
        title={S.editLesson}
        actions={data.lesson.published && (
          <ButtonLink href={`/learn/lesson/${id}`} variant="ghost" size="sm">{S.viewAsStudent} <Icon name="external" className="size-3.5" /></ButtonLink>
        )}
      />
      {saved && <div className="mb-4"><Notice tone="ok">{t.common.saved}</Notice></div>}
      <LessonEditor key={id} units={data.units} docs={data.docs} lesson={data.lesson} pages={data.pages} unitId={unit_id} />
      <form action={deleteLessonAction} className="mt-8 border-t border-border pt-4">
        <input type="hidden" name="id" value={id} />
        <ConfirmButton message={S.confirmDeleteLesson} className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-danger hover:underline">
          <Icon name="trash" className="size-3.5" /> {S.deleteLesson}
        </ConfirmButton>
      </form>
    </>
  );
}
