'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin, requireStaff, requireClass } from '@/lib/auth';
import { isUuid } from '@/lib/db';
import * as cl from '@/lib/classes';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const done = (id?: string) => {
  revalidatePath('/admin/classes');
  if (id) revalidatePath(`/admin/classes/${id}`);
};

/** Form actions below return '' on success or a message to show (thrown messages are hidden in production). */
export async function createClassAction(_prev: string, fd: FormData): Promise<string> {
  const user = await requireStaff();
  const subjectId = str(fd, 'subjectId'), name = str(fd, 'name'), year = str(fd, 'batchYear');
  const teacherId = user.role === 'teacher' ? user.id : str(fd, 'teacherId') || user.id;
  const batchYear = year ? Number(year) : null;
  if (!isUuid(subjectId) || !isUuid(teacherId)) return 'Pick a subject and teacher.';
  if (!name || name.length > 100) return 'Name must be 1–100 characters.';
  if (batchYear !== null && !(Number.isInteger(batchYear) && batchYear >= 2000 && batchYear <= 2100)) return 'Batch year must be 2000–2100.';
  const error = await cl.createClass(user, { subjectId, name, batchYear, teacherId });
  if (!error) done();
  return error;
}

export async function postAnnouncementAction(_prev: string, fd: FormData): Promise<string> {
  const user = await requireStaff();
  const id = str(fd, 'classId'), body = str(fd, 'body');
  if (!isUuid(id)) return 'Bad class.';
  await requireClass(user, id);
  if (!body || body.length > 2000) return 'Write 1–2000 characters.';
  const error = await cl.postAnnouncement(user, id, body);
  if (!error) done(id);
  return error;
}

export async function reassignTeacherAction(_prev: string, fd: FormData): Promise<string> {
  const admin = await requireAdmin();
  const id = str(fd, 'classId'), teacherId = str(fd, 'teacherId');
  if (!isUuid(id) || !isUuid(teacherId)) return 'Pick a teacher.';
  const error = await cl.reassignTeacher(admin, id, teacherId);
  if (!error) done(id);
  return error;
}

/** Plain form actions: nothing to report besides success. */
export async function regenerateCodeAction(fd: FormData) {
  const user = await requireStaff();
  const id = str(fd, 'classId');
  if (!isUuid(id)) return;
  await requireClass(user, id);
  await cl.regenerateCode(user, id);
  done(id);
}

export async function archiveClassAction(fd: FormData) {
  const user = await requireStaff();
  const id = str(fd, 'classId');
  if (!isUuid(id)) return;
  await requireClass(user, id);
  await cl.setArchived(user, id, str(fd, 'archived') === '1');
  done(id);
}

export async function removeMemberAction(fd: FormData) {
  const user = await requireStaff();
  const id = str(fd, 'classId'), studentId = str(fd, 'studentId');
  if (!isUuid(id) || !isUuid(studentId)) return;
  await requireClass(user, id);
  await cl.removeMember(user, id, studentId);
  done(id);
}

export async function deleteAnnouncementAction(fd: FormData) {
  const user = await requireStaff();
  const id = str(fd, 'classId'), postId = str(fd, 'postId');
  if (!isUuid(id) || !isUuid(postId)) return;
  await requireClass(user, id);
  await cl.deleteAnnouncement(user, id, postId);
  done(id);
}
