import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, requireClass } from '@/lib/auth';
import { sql, isUuid } from '@/lib/db';
import { getClassDetail } from '@/lib/classes';
import { formatCode } from '@/lib/joincode';
import { getT } from '@/lib/prefs';
import { fmt } from '@/lib/i18n';
import { Badge, Card, Icon, Label, PageHeader, Select, Textarea, btn } from '@/app/ui/ui';
import ConfirmButton from '@/app/ui/ConfirmButton';
import {
  postAnnouncementAction, reassignTeacherAction, regenerateCodeAction, archiveClassAction,
  removeMemberAction, deleteAnnouncementAction,
} from '../../class-actions';
import MessageForm from '../../MessageForm';
import CopyCode from './CopyCode';

const when = (d: Date) => d.toLocaleString('en-LK', { timeZone: 'Asia/Colombo' });

export default async function ClassPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireClass(user, id);
  const [c, { t }] = await Promise.all([getClassDetail(id), getT()]);
  if (!c) notFound();
  const S = t.staff;
  const isAdmin = user.role === 'admin';
  const teachers = isAdmin ? await sql<{ id: string; name: string }[]>`
    select p.id, p.name from profiles p join teacher_subjects ts on ts.teacher_id = p.id
    where p.role = 'teacher' and ts.subject_id = ${c.subject_id} order by p.name` : [];
  const code = formatCode(c.join_code);

  return (
    <>
      <Link href="/admin/classes" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <Icon name="arrowLeft" /> {S.classes}
      </Link>
      <PageHeader
        eyebrow={c.subject}
        title={<>{c.name} {c.archived && <Badge className="align-middle">{S.archived}</Badge>}</>}
        description={<>{S.batch} <span className="font-mono">{c.batch_year ?? '—'}</span> · {fmt(S.teacherOf, { name: c.teacher ?? '—' })}</>}
        actions={
          <form action={archiveClassAction}>
            <input type="hidden" name="classId" value={c.id} />
            <input type="hidden" name="archived" value={c.archived ? '0' : '1'} />
            <button className={btn('secondary', 'sm')}>{c.archived ? S.unarchive : S.archive}</button>
          </form>
        }
      />

      <Card className="mb-6 flex flex-wrap items-center gap-4">
        <div>
          <Label>{S.joinCode}</Label>
          <p className="font-mono text-3xl font-semibold tracking-[0.2em]">{code}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <CopyCode code={code} />
          <form action={regenerateCodeAction}>
            <input type="hidden" name="classId" value={c.id} />
            <button className={btn('ghost', 'sm')} title={S.regenerateHint}><Icon name="refresh" className="size-3.5" /> {S.regenerate}</button>
          </form>
        </div>
      </Card>

      {isAdmin && (
        <MessageForm action={reassignTeacherAction} submit={S.changeTeacher} className="mb-6 flex flex-wrap items-center gap-2">
          <input type="hidden" name="classId" value={c.id} />
          <Select name="teacherId" defaultValue={c.teacher_id ?? ''} required className="min-h-9 py-1" aria-label={S.teacher}>
            <option value="" disabled>—</option>
            <option value={user.id}>{S.me}</option>
            {c.teacher_id && c.teacher_id !== user.id && !teachers.some((x) => x.id === c.teacher_id) && (
              <option value={c.teacher_id} disabled>{c.teacher ?? '—'}</option>
            )}
            {teachers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </MessageForm>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <Label>{S.announcements}</Label>
          {!c.archived && (
            <Card>
              <MessageForm action={postAnnouncementAction} submit={S.post} className="space-y-2">
                <input type="hidden" name="classId" value={c.id} />
                <Textarea name="body" required maxLength={2000} rows={3} placeholder={S.messagePh} aria-label={S.messagePh} />
              </MessageForm>
            </Card>
          )}
          {c.posts.map((p) => (
            <Card key={p.id} className="space-y-1 py-3">
              <div className="flex items-center gap-2">
                <p className="mr-auto font-mono text-xs text-subtle">{when(p.created_at)} · {p.author ?? '—'}</p>
                {(isAdmin || p.created_by === user.id) && (
                  <form action={deleteAnnouncementAction}>
                    <input type="hidden" name="classId" value={c.id} />
                    <input type="hidden" name="postId" value={p.id} />
                    <button aria-label={t.common.delete} className="cursor-pointer rounded p-1 text-subtle hover:text-danger"><Icon name="trash" className="size-3.5" /></button>
                  </form>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm">{p.body}</p>
            </Card>
          ))}
          {!c.posts.length && <p className="text-sm text-subtle">{S.noAnnouncements}</p>}
        </section>

        <section className="space-y-3">
          <Label>{S.students} <span className="font-mono">({c.members.length})</span></Label>
          <Card className="p-0">
            {!c.members.length && <p className="p-4 text-sm text-subtle">{S.noStudents}</p>}
            <ul className="divide-y divide-border">
              {c.members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="mr-auto min-w-0">
                    <p className="truncate font-medium">{m.name || '—'}</p>
                    <p className="truncate text-xs text-subtle">{m.email} · <span className="font-mono">{m.joined.toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' })}</span></p>
                  </div>
                  <form action={removeMemberAction}>
                    <input type="hidden" name="classId" value={c.id} />
                    <input type="hidden" name="studentId" value={m.id} />
                    <ConfirmButton message={fmt(S.confirmRemove, { name: m.name || m.email })} className="cursor-pointer text-xs text-subtle hover:text-danger">
                      {S.remove}
                    </ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      </div>
    </>
  );
}
