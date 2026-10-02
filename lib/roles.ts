export type Role = 'admin' | 'teacher' | 'student';
export const ROLES: Role[] = ['admin', 'teacher', 'student'];

/** Why this role change is not allowed, or null when it is. */
export function canEditRole(c: { actorId: string; targetId: string; targetRole: Role; newRole: Role; adminCount: number }): string | null {
  if (c.targetRole !== 'admin' || c.newRole === 'admin') return null;
  if (c.actorId === c.targetId) return "You can't remove your own admin role.";
  if (c.adminCount <= 1) return "Can't remove the last admin.";
  return null;
}
