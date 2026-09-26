'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { sql, isUuid } from '@/lib/db';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
function need(ok: unknown, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

// ── Subjects & units ─────────────────────────────────────────────
export async function saveSubject(fd: FormData) {
  await requireAdmin();
  const id = str(fd, 'id'), si = str(fd, 'name_si'), en = str(fd, 'name_en');
  need(si && en, 'Both names are required');
  if (id) {
    need(isUuid(id), 'Bad id');
    await sql`update subjects set name_si = ${si}, name_en = ${en} where id = ${id}`;
  } else {
    await sql`insert into subjects (name_si, name_en) values (${si}, ${en})`;
  }
  revalidatePath('/admin/subjects');
}

export async function deleteSubject(fd: FormData) {
  await requireAdmin();
  const id = str(fd, 'id');
  need(isUuid(id), 'Bad id');
  // The UI only offers delete for subjects without documents; the FK blocks it otherwise.
  await sql`delete from subjects where id = ${id}`;
  revalidatePath('/admin/subjects');
}

export async function saveUnit(fd: FormData) {
  await requireAdmin();
  const id = str(fd, 'id'), subjectId = str(fd, 'subject_id');
  const si = str(fd, 'name_si'), en = str(fd, 'name_en'), order = Number(str(fd, 'sort_order') || 0);
  need(si && en, 'Both names are required');
  need(Number.isInteger(order), 'Order must be a whole number');
  if (id) {
    need(isUuid(id), 'Bad id');
    await sql`update units set name_si = ${si}, name_en = ${en}, sort_order = ${order} where id = ${id}`;
  } else {
    need(isUuid(subjectId), 'Bad subject');
    await sql`insert into units (subject_id, name_si, name_en, sort_order) values (${subjectId}, ${si}, ${en}, ${order})`;
  }
  revalidatePath('/admin/subjects');
}

export async function deleteUnit(fd: FormData) {
  await requireAdmin();
  const id = str(fd, 'id');
  need(isUuid(id), 'Bad id');
  await sql`delete from units where id = ${id}`;
  revalidatePath('/admin/subjects');
}
