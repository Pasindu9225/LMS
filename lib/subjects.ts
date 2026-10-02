import { asUser } from '@/lib/db';

/** Deletes a subject only when no documents or classes use it. false = still in use (or missing). */
export async function deleteSubjectIfUnused(adminId: string, id: string): Promise<boolean> {
  const r = await asUser(adminId, (tx) => tx`
    delete from subjects s where s.id = ${id}
      and not exists (select 1 from documents d where d.subject_id = s.id)
      and not exists (select 1 from classes c where c.subject_id = s.id)`);
  return r.count === 1;
}
