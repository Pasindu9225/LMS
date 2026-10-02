import Link from 'next/link';
import { requireStaff } from '@/lib/auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const admin = user.role === 'admin';
  return (
    <div className="mx-auto max-w-6xl p-4">
      <nav className="mb-6 flex flex-wrap items-center gap-4 border-b pb-3 text-sm">
        <span className="font-semibold">{admin ? 'Admin' : 'Teacher'}</span>
        <Link href="/admin/documents" className="text-blue-600">Documents</Link>
        {admin && <Link href="/admin/subjects" className="text-blue-600">Subjects</Link>}
        <Link href="/admin/logs" className="text-blue-600">Chat logs</Link>
        <Link href="/admin/flags" className="text-blue-600">Flags</Link>
        <Link href="/admin/lessons" className="text-blue-600">Lessons</Link>
        <Link href="/admin/classes" className="text-blue-600">Classes</Link>
        {admin && <Link href="/admin/users" className="text-blue-600">Users</Link>}
        <Link href="/chat" className="text-blue-600">Student chat</Link>
        <form action="/auth/signout" method="post" className="ml-auto">
          <button className="text-gray-600">Log out</button>
        </form>
      </nav>
      {children}
    </div>
  );
}
