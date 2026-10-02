import { describe, it, expect } from 'vitest';
import { canEditRole } from '@/lib/roles';

const base = { actorId: 'a', targetId: 'b', targetRole: 'student' as const, newRole: 'teacher' as const, adminCount: 1 };

describe('canEditRole', () => {
  it('allows promoting and demoting other users', () => {
    expect(canEditRole(base)).toBeNull();
    expect(canEditRole({ ...base, targetRole: 'teacher', newRole: 'student' })).toBeNull();
    expect(canEditRole({ ...base, targetRole: 'admin', newRole: 'teacher', adminCount: 2 })).toBeNull();
  });
  it('blocks changing your own role away from admin', () => {
    expect(canEditRole({ ...base, targetId: 'a', targetRole: 'admin', newRole: 'teacher', adminCount: 3 })).toMatch(/your own/);
  });
  it('blocks removing the last admin', () => {
    expect(canEditRole({ ...base, targetRole: 'admin', newRole: 'student', adminCount: 1 })).toMatch(/last admin/);
  });
  it('allows saving an admin as admin (e.g. unchanged role)', () => {
    expect(canEditRole({ ...base, targetId: 'a', targetRole: 'admin', newRole: 'admin', adminCount: 1 })).toBeNull();
  });
});
