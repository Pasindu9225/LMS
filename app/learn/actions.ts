'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { isUuid } from '@/lib/db';
import { setDone } from '@/lib/lessons';

export async function setDoneAction(fd: FormData) {
  const user = await requireUser();
  const id = String(fd.get('lessonId') ?? '');
  if (!isUuid(id)) return;
  await setDone(user.id, id, fd.get('done') === '1');
  revalidatePath('/learn', 'layout');
}
