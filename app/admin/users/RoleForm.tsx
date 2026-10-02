'use client';
import { useActionState } from 'react';
import { saveUserRole } from '@/app/admin/actions';
import { ROLES, type Role } from '@/lib/roles';

type Props = { id: string; role: Role; subjectIds: string[]; subjects: { id: string; name_en: string }[] };

export default function RoleForm({ id, role, subjectIds, subjects }: Props) {
  const [error, action, pending] = useActionState(saveUserRole, '');
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <select name="role" defaultValue={role} className="rounded border p-1 text-sm">
        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <fieldset className="flex flex-wrap gap-2 text-xs">
        <legend className="sr-only">Subjects (teachers)</legend>
        {subjects.map((s) => (
          <label key={s.id} className="flex items-center gap-1">
            <input type="checkbox" name="subjects" value={s.id} defaultChecked={subjectIds.includes(s.id)} />
            {s.name_en}
          </label>
        ))}
      </fieldset>
      <button disabled={pending} className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50">Save</button>
      {error && <span role="alert" className="text-sm text-red-600">{error}</span>}
    </form>
  );
}
