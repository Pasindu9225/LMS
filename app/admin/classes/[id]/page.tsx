import { notFound } from 'next/navigation';
import { requireStaff, requireClass } from '@/lib/auth';
import { sql, isUuid } from '@/lib/db';
import { getClassDetail } from '@/lib/classes';
import { formatCode } from '@/lib/joincode';
import {
  postAnnouncementAction, reassignTeacherAction, regenerateCodeAction, archiveClassAction,
  removeMemberAction, deleteAnnouncementAction,
} from '../../class-actions';
import MessageForm from '../../MessageForm';
import CopyCode from './CopyCode';
import ConfirmButton from '../../ConfirmButton';

const when = (d: Date) => d.toLocaleString('en-LK', { timeZone: 'Asia/Colombo' });

export default async function ClassPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireClass(user, id);
  const c = await getClassDetail(id);
  if (!c) notFound();
  const isAdmin = user.role === 'admin';
  const teachers = isAdmin ? await sql<{ id: string; name: string }[]>`
    select p.id, p.name from profiles p join teacher_subjects ts on ts.teacher_id = p.id
    where p.role = 'teacher' and ts.subject_id = ${c.subject_id} order by p.name` : [];
  const code = formatCode(c.join_code);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{c.name}{c.archived && ' (archived)'}</h1>
        <p className="text-sm text-gray-600">{c.subject} · batch {c.batch_year ?? '—'} · teacher {c.teacher ?? '—'}</p>
      </div>

      <section className="flex flex-wrap items-center gap-3 rounded border p-3">
        <span className="text-sm text-gray-600">Join code</span>
        <span className="font-mono text-2xl tracking-widest">{code}</span>
        <CopyCode code={code} />
        <form action={regenerateCodeAction}>
          <input type="hidden" name="classId" value={c.id} />
          <button className="rounded border px-2 py-1 text-sm">Regenerate (old code stops working)</button>
        </form>
        <form action={archiveClassAction} className="ml-auto">
          <input type="hidden" name="classId" value={c.id} />
          <input type="hidden" name="archived" value={c.archived ? '0' : '1'} />
          <button className="rounded border px-2 py-1 text-sm">{c.archived ? 'Unarchive' : 'Archive'}</button>
        </form>
      </section>

      {isAdmin && (
        <MessageForm action={reassignTeacherAction} submit="Change teacher" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="classId" value={c.id} />
          <select name="teacherId" defaultValue={c.teacher_id ?? user.id} className="rounded border p-1 text-sm" aria-label="Teacher">
            <option value={user.id}>Me (admin)</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </MessageForm>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Announcements</h2>
        {!c.archived && (
          <MessageForm action={postAnnouncementAction} submit="Post" className="space-y-2">
            <input type="hidden" name="classId" value={c.id} />
            <textarea name="body" required maxLength={2000} rows={3} placeholder="Message to the class" className="w-full rounded border p-2 text-sm" />
          </MessageForm>
        )}
        {c.posts.map((p) => (
          <div key={p.id} className="rounded border p-2 text-sm">
            <p className="text-xs text-gray-500">{when(p.created_at)} · {p.author ?? '—'}</p>
            <p className="whitespace-pre-wrap">{p.body}</p>
            {(isAdmin || p.created_by === user.id) && (
              <form action={deleteAnnouncementAction}>
                <input type="hidden" name="classId" value={c.id} />
                <input type="hidden" name="postId" value={p.id} />
                <button className="text-xs text-gray-500 underline">Delete</button>
              </form>
            )}
          </div>
        ))}
        {!c.posts.length && <p className="text-sm text-gray-600">No announcements yet.</p>}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Students ({c.members.length})</h2>
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b"><th>Name</th><th>Email</th><th>Joined</th><th /></tr></thead>
          <tbody>
            {c.members.map((m) => (
              <tr key={m.id} className="border-b">
                <td className="py-1">{m.name || '—'}</td>
                <td>{m.email}</td>
                <td>{m.joined.toLocaleDateString('en-LK', { timeZone: 'Asia/Colombo' })}</td>
                <td>
                  <form action={removeMemberAction}>
                    <input type="hidden" name="classId" value={c.id} />
                    <input type="hidden" name="studentId" value={m.id} />
                    <ConfirmButton message={`Remove ${m.name || m.email} from this class?`} className="text-xs text-red-600 underline">Remove</ConfirmButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!c.members.length && <p className="text-sm text-gray-600">No students yet. Share the join code.</p>}
      </section>
    </div>
  );
}
