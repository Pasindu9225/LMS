import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/auth';

/** /admin: admins start at Documents, teachers at their flag queue. */
export default async function AdminHome() {
  const user = await requireStaff();
  redirect(user.role === 'admin' ? '/admin/documents' : '/admin/flags');
}
