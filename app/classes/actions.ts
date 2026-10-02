'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { isUuid } from '@/lib/db';
import { joinClass, leaveClass, type JoinResult } from '@/lib/classes';

export type JoinState = JoinResult | 'staff' | '';

export async function joinClassAction(_prev: JoinState, fd: FormData): Promise<JoinState> {
  const user = await requireUser();
  if (user.role !== 'student') return 'staff';
  const result = await joinClass(user.id, String(fd.get('code') ?? ''));
  if (result === 'joined') revalidatePath('/classes');
  return result;
}

export async function leaveClassAction(fd: FormData) {
  const user = await requireUser();
  const id = String(fd.get('classId') ?? '');
  if (!isUuid(id)) return;
  await leaveClass(user.id, id);
  revalidatePath('/classes');
}
