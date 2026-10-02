import { sql, asUser } from '@/lib/db';
import { canEditRole, type Role } from '@/lib/roles';

/**
 * Sets a user's role and (for teachers) their subjects, as one transaction recorded as adminId.
 * Returns '' on success or why it was refused. Inputs must already be validated.
 */
export function setUserRole(adminId: string, targetId: string, role: Role, subjectIds: string[]): Promise<string> {
  return asUser(adminId, async (tx) => {
    const [target] = await tx<{ role: Role }[]>`select role from profiles where id = ${targetId} for update`;
    if (!target) return 'User not found.';
    // Lock every admin row so two admins can't demote each other at the same moment.
    const admins = await tx`select id from profiles where role = 'admin' for update`;
    // requireAdmin() ran before this transaction; the actor may have been demoted since.
    if (!admins.some((a) => a.id === adminId)) return 'You are no longer an admin.';
    const why = canEditRole({ actorId: adminId, targetId, targetRole: target.role, newRole: role, adminCount: admins.length });
    if (why) return why;
    await tx`update profiles set role = ${role} where id = ${targetId}`;
    await tx`delete from teacher_subjects where teacher_id = ${targetId}`;
    if (role === 'teacher' && subjectIds.length) await tx`
      insert into teacher_subjects (teacher_id, subject_id)
      select ${targetId}, s.id from subjects s where s.id = any(${sql.array(subjectIds)}::uuid[])`;
    return '';
  });
}
