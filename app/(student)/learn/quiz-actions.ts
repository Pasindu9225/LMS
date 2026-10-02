'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { isUuid } from '@/lib/db';
import { makePracticeQuiz, submitQuiz } from '@/lib/practice';

export type MakeState = '' | 'limit' | 'material' | 'failed' | 'invalid';

/** Generates a quiz for a unit and opens it; returns a reason when it can't. */
export async function makeQuizAction(_prev: MakeState, fd: FormData): Promise<MakeState> {
  const user = await requireUser();
  const unitId = String(fd.get('unitId') ?? '');
  const lang = fd.get('lang') === 'en' ? 'en' : 'si';
  if (!isUuid(unitId)) return 'invalid';
  const r = await makePracticeQuiz(user.id, unitId, lang);
  if ('error' in r) return r.error;
  revalidatePath('/learn', 'layout');
  redirect(`/learn/quiz/${r.id}`);
}

export type SubmitState = '' | 'invalid' | 'done';

export async function submitQuizAction(_prev: SubmitState, fd: FormData): Promise<SubmitState> {
  const user = await requireUser();
  const id = String(fd.get('quizId') ?? '');
  const count = Number(fd.get('count'));
  if (!isUuid(id) || !Number.isInteger(count) || count < 1 || count > 10) return 'invalid';
  const answers = Array.from({ length: count }, (_, i) => Number(fd.get(`q${i}`) ?? NaN));
  const r = await submitQuiz(user.id, id, answers);
  if (r === 'ok') {
    revalidatePath('/learn', 'layout');
    return '';
  }
  return r;
}
