'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff, requireLesson } from '@/lib/auth';
import { isUuid } from '@/lib/db';
import { saveLesson, deleteLesson, type PageRef } from '@/lib/lessons';
import { parseYouTubeId } from '@/lib/youtube';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const ints = (fd: FormData, k: string) => fd.getAll(k).map((v) => Number(v));

/** Returns a message to show; on success redirects to the saved lesson. */
export async function saveLessonAction(_prev: string, fd: FormData): Promise<string> {
  const user = await requireStaff();
  const id = str(fd, 'id') || undefined;
  if (id) {
    if (!isUuid(id)) return 'Bad lesson.';
    await requireLesson(user, id);
  }
  const unitId = str(fd, 'unitId'), title = str(fd, 'title'), body = String(fd.get('body') ?? '').replace(/\r\n/g, '\n');
  const video = str(fd, 'video'), sortOrder = Number(str(fd, 'sortOrder') || 0);
  const docs = fd.getAll('pageDoc').map(String), from = ints(fd, 'pageFrom'), to = ints(fd, 'pageTo');
  if (!isUuid(unitId)) return 'Pick a unit.';
  if (!title || title.length > 200) return 'Title must be 1–200 characters.';
  if (body.length > 50000) return 'Notes are too long (50,000 characters max).';
  if (!Number.isInteger(sortOrder)) return 'Position must be a whole number.';
  const youtubeId = video ? parseYouTubeId(video) : null;
  if (video && !youtubeId) return 'That is not a YouTube video link.';
  const pages: PageRef[] = docs.map((documentId, i) => ({ documentId, from: from[i], to: to[i] }));
  if (pages.some((p) => !isUuid(p.documentId) || !Number.isInteger(p.from) || !Number.isInteger(p.to) || p.from < 1 || p.to < p.from)) {
    return 'Each textbook link needs a document and pages from ≤ to.';
  }
  const r = await saveLesson(user, { id, unitId, title, body, youtubeId, sortOrder, published: fd.get('published') === 'on', pages });
  if (r.error) return r.error;
  revalidatePath('/admin/lessons');
  revalidatePath('/learn', 'layout');
  redirect(`/admin/lessons/${r.id}?saved=1`);
}

export async function deleteLessonAction(fd: FormData) {
  const user = await requireStaff();
  const id = str(fd, 'id');
  if (!isUuid(id)) return;
  const { subject_id } = await requireLesson(user, id);
  await deleteLesson(user, id);
  revalidatePath('/learn', 'layout');
  redirect(`/admin/lessons?subject=${subject_id}`);
}
