import { sql, asUser } from '@/lib/db';
import { subjectScope, type AppUser } from '@/lib/auth';
import { newJoinCode, normalizeCode } from '@/lib/joincode';

const isUniqueViolation = (e: unknown) => (e as { code?: string }).code === '23505';

/** Runs fn with a fresh join code, retrying on the (rare) clash with an existing code. */
async function withFreshCode<T>(fn: (code: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(newJoinCode());
    } catch (e) {
      if (!isUniqueViolation(e) || attempt >= 4) throw e;
    }
  }
}

/** Who may teach a class in this subject: the admin themself, or a teacher assigned to the subject. */
async function canTeach(teacherId: string, subjectId: string, admin: AppUser) {
  if (teacherId === admin.id) return true;
  const [t] = await sql`
    select 1 from profiles p join teacher_subjects ts on ts.teacher_id = p.id
    where p.id = ${teacherId} and p.role = 'teacher' and ts.subject_id = ${subjectId}`;
  return !!t;
}

/** '' on success, or why not. Teachers create in their own subjects, as themselves. */
export async function createClass(user: AppUser, input: { subjectId: string; name: string; batchYear: number | null; teacherId: string }) {
  const scope = await subjectScope(user);
  if (scope !== null && !scope.includes(input.subjectId)) return 'You are not assigned to this subject.';
  if (user.role === 'teacher' && input.teacherId !== user.id) return 'Teachers create classes for themselves.';
  if (user.role === 'admin' && !(await canTeach(input.teacherId, input.subjectId, user))) return 'That teacher is not assigned to this subject.';
  await withFreshCode((code) => asUser(user.id, (tx) => tx`
    insert into classes (subject_id, teacher_id, name, batch_year, join_code)
    values (${input.subjectId}, ${input.teacherId}, ${input.name}, ${input.batchYear}, ${code})`));
  return '';
}

export function regenerateCode(user: AppUser, classId: string) {
  return withFreshCode((code) => asUser(user.id, (tx) => tx`update classes set join_code = ${code} where id = ${classId}`));
}

export function setArchived(user: AppUser, classId: string, archived: boolean) {
  return asUser(user.id, (tx) => tx`update classes set archived = ${archived} where id = ${classId}`);
}

export async function reassignTeacher(admin: AppUser, classId: string, teacherId: string) {
  const [c] = await sql<{ subject_id: string }[]>`select subject_id from classes where id = ${classId}`;
  if (!c) return 'Class not found.';
  if (!(await canTeach(teacherId, c.subject_id, admin))) return 'That teacher is not assigned to this subject.';
  await asUser(admin.id, (tx) => tx`update classes set teacher_id = ${teacherId} where id = ${classId}`);
  return '';
}

export function removeMember(user: AppUser, classId: string, studentId: string) {
  return asUser(user.id, (tx) => tx`delete from class_members where class_id = ${classId} and student_id = ${studentId}`);
}

export async function postAnnouncement(user: AppUser, classId: string, body: string) {
  const r = await asUser(user.id, (tx) => tx`
    insert into announcements (class_id, body)
    select id, ${body} from classes where id = ${classId} and not archived`);
  return r.count === 1 ? '' : 'This class is archived.';
}

/** The poster deletes their own; admins delete any. Scope to the class is checked by the caller. */
export function deleteAnnouncement(user: AppUser, classId: string, announcementId: string) {
  return asUser(user.id, (tx) => tx`
    delete from announcements
    where id = ${announcementId} and class_id = ${classId} and (${user.role === 'admin'} or created_by = ${user.id})`);
}

export type JoinResult = 'joined' | 'invalid' | 'archived' | 'already';

export async function joinClass(studentId: string, typed: string): Promise<JoinResult> {
  const code = normalizeCode(typed);
  if (!code) return 'invalid';
  const [c] = await sql<{ id: string; archived: boolean }[]>`select id, archived from classes where join_code = ${code}`;
  if (!c) return 'invalid';
  if (c.archived) return 'archived';
  const r = await asUser(studentId, (tx) => tx`
    insert into class_members (class_id, student_id) values (${c.id}, ${studentId}) on conflict do nothing`);
  return r.count === 1 ? 'joined' : 'already';
}

export function leaveClass(studentId: string, classId: string) {
  return asUser(studentId, (tx) => tx`delete from class_members where class_id = ${classId} and student_id = ${studentId}`);
}

export type StaffClassRow = {
  id: string; name: string; batch_year: number | null; archived: boolean; subject: string; teacher: string | null; students: number;
};

/** Admin: every class. Teacher: classes they teach in subjects they still hold. */
export async function listStaffClasses(user: AppUser) {
  const scope = await subjectScope(user);
  return sql<StaffClassRow[]>`
    select c.id, c.name, c.batch_year, c.archived, s.name_en as subject, p.name as teacher,
           (select count(*)::int from class_members m where m.class_id = c.id) as students
    from classes c join subjects s on s.id = c.subject_id left join profiles p on p.id = c.teacher_id
    where ${scope === null} or (c.teacher_id = ${user.id} and c.subject_id = any(${sql.array(scope ?? [])}::uuid[]))
    order by c.archived, c.created_at desc`;
}

export async function getClassDetail(classId: string) {
  const [[c], members, posts] = await Promise.all([
    sql<{ id: string; name: string; batch_year: number | null; archived: boolean; join_code: string; subject_id: string; subject: string; teacher_id: string | null; teacher: string | null }[]>`
      select c.id, c.name, c.batch_year, c.archived, c.join_code, c.subject_id, s.name_en as subject, c.teacher_id, p.name as teacher
      from classes c join subjects s on s.id = c.subject_id left join profiles p on p.id = c.teacher_id where c.id = ${classId}`,
    sql<{ id: string; name: string; email: string; joined: Date }[]>`
      select p.id, p.name, u.email, m.created_at as joined
      from class_members m join profiles p on p.id = m.student_id join auth.users u on u.id = p.id
      where m.class_id = ${classId} order by p.name`,
    sql<{ id: string; body: string; created_at: Date; created_by: string | null; author: string | null }[]>`
      select a.id, a.body, a.created_at, a.created_by, p.name as author
      from announcements a left join profiles p on p.id = a.created_by
      where a.class_id = ${classId} order by a.created_at desc limit 100`,
  ]);
  return c ? { ...c, members: [...members], posts: [...posts] } : null;
}

export type StudentClass = {
  id: string; name: string; batch_year: number | null; archived: boolean; subject_si: string; subject_en: string;
  teacher: string | null; posts: { id: string; body: string; created_at: string }[];
};

/** The student's classes with their latest 20 announcements each. */
export async function listStudentClasses(studentId: string): Promise<StudentClass[]> {
  return [...await sql<StudentClass[]>`
    select c.id, c.name, c.batch_year, c.archived, s.name_si as subject_si, s.name_en as subject_en, p.name as teacher,
           coalesce((
             select json_agg(json_build_object('id', a.id, 'body', a.body, 'created_at', a.created_at) order by a.created_at desc)
             from (select * from announcements where class_id = c.id order by created_at desc limit 20) a
           ), '[]'::json) as posts
    from class_members m join classes c on c.id = m.class_id join subjects s on s.id = c.subject_id
    left join profiles p on p.id = c.teacher_id
    where m.student_id = ${studentId}
    order by c.archived, m.created_at desc`];
}
