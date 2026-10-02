'use client';
import { useActionState } from 'react';
import { saveUserRole } from '@/app/admin/actions';
import { ROLES, type Role } from '@/lib/roles';
import { useT } from '@/app/ui/prefs';
import { Select, btn } from '@/app/ui/ui';

type Props = { id: string; role: Role; subjectIds: string[]; subjects: { id: string; name_en: string }[] };
const roleKey = { admin: 'roleAdmin', teacher: 'roleTeacher', student: 'roleStudent' } as const;

export default function RoleForm({ id, role, subjectIds, subjects }: Props) {
  const [error, action, pending] = useActionState(saveUserRole, '');
  const { t } = useT();
  const S = t.staff;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Select name="role" defaultValue={role} className="min-h-9 py-1" aria-label={S.roleSubjects}>
        {ROLES.map((r) => <option key={r} value={r}>{S[roleKey[r]]}</option>)}
      </Select>
      <fieldset className="flex flex-wrap gap-1.5">
        <legend className="sr-only">{S.subjects}</legend>
        {subjects.map((s) => (
          <label key={s.id} className="flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border border-border-strong px-2.5 text-xs text-muted has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent">
            <input type="checkbox" name="subjects" value={s.id} defaultChecked={subjectIds.includes(s.id)} className="accent-[var(--accent)]" />
            {s.name_en}
          </label>
        ))}
      </fieldset>
      <button disabled={pending} className={btn('secondary', 'sm')}>{t.common.save}</button>
      {error && <span role="alert" className="text-sm text-danger">{error}</span>}
    </form>
  );
}
