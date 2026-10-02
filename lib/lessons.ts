import { sql, asUser } from '@/lib/db';
import { subjectScope, type AppUser } from '@/lib/auth';

export type PageRef = { documentId: string; from: number; to: number };
export type LessonInput = {
  id?: string; unitId: string; title: string; body: string; youtubeId: string | null;
  sortOrder: number; published: boolean; pages: PageRef[];
};

/**
 * Creates or updates a lesson and replaces its textbook page links in one transaction.
 * Returns { error } ('' on success) and the lesson id.
 */
export async function saveLesson(user: AppUser, input: LessonInput): Promise<{ error: string; id?: string }> {
  const [unit] = await sql<{ subject_id: string }[]>`select subject_id from units where id = ${input.unitId}`;
  const scope = await subjectScope(user);
  if (!unit || (scope !== null && !scope.includes(unit.subject_id))) return { error: 'You are not assigned to this subject.' };
  if (input.id) {
    const [old] = await sql<{ subject_id: string }[]>`
      select u.subject_id from lessons l join units u on u.id = l.unit_id where l.id = ${input.id}`;
    if (!old) return { error: 'Lesson not found.' };
    if (old.subject_id !== unit.subject_id) return { error: 'A lesson can only move to a unit of the same subject.' };
  }
  const docIds = [...new Set(input.pages.map((p) => p.documentId))];
  if (docIds.length) {
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from documents where id = any(${sql.array(docIds)}::uuid[]) and subject_id = ${unit.subject_id}`;
    if (n !== docIds.length) return { error: 'Textbook links must be documents of this subject.' };
  }

  const id = await asUser(user.id, async (tx) => {
    let lessonId = input.id;
    if (lessonId) {
      await tx`
        update lessons set unit_id = ${input.unitId}, title = ${input.title}, body = ${input.body},
          youtube_id = ${input.youtubeId}, sort_order = ${input.sortOrder}, published = ${input.published}
        where id = ${lessonId}`;
      await tx`delete from lesson_pages where lesson_id = ${lessonId}`;
    } else {
      const [row] = await tx<{ id: string }[]>`
        insert into lessons (unit_id, title, body, youtube_id, sort_order, published)
        values (${input.unitId}, ${input.title}, ${input.body}, ${input.youtubeId}, ${input.sortOrder}, ${input.published})
        returning id`;
      lessonId = row.id;
    }
    for (const [i, p] of input.pages.entries()) {
      await tx`
        insert into lesson_pages (lesson_id, document_id, page_from, page_to, sort_order)
        values (${lessonId}, ${p.documentId}, ${p.from}, ${p.to}, ${i})`;
    }
    return lessonId;
  });
  return { error: '', id };
}

export function deleteLesson(user: AppUser, id: string) {
  return asUser(user.id, (tx) => tx`delete from lessons where id = ${id}`);
}

const unitOrder = sql`u.sort_order, u.name_en`;
const lessonOrder = sql`l.sort_order, l.created_at`;

/** Staff view of one subject: every unit with all its lessons, drafts included. */
export async function staffOutline(subjectId: string) {
  const [units, lessons] = await Promise.all([
    sql<{ id: string; name_si: string; name_en: string }[]>`
      select u.id, u.name_si, u.name_en from units u where u.subject_id = ${subjectId} order by ${unitOrder}`,
    sql<{ id: string; unit_id: string; title: string; sort_order: number; published: boolean }[]>`
      select l.id, l.unit_id, l.title, l.sort_order, l.published
      from lessons l join units u on u.id = l.unit_id where u.subject_id = ${subjectId} order by ${lessonOrder}`,
  ]);
  return units.map((u) => ({ ...u, lessons: lessons.filter((l) => l.unit_id === u.id) }));
}

export type SubjectDoc = { id: string; title: string; status: string; page_count: number };

/** Everything the editor needs: the lesson (if any), its subject's units and documents. */
export async function editorData(subjectId: string, lessonId?: string) {
  const [units, docs, lesson, pages] = await Promise.all([
    sql<{ id: string; name_en: string; name_si: string }[]>`select u.id, u.name_en, u.name_si from units u where u.subject_id = ${subjectId} order by ${unitOrder}`,
    sql<SubjectDoc[]>`select id, title, status, page_count from documents where subject_id = ${subjectId} order by title`,
    lessonId ? sql<{ id: string; unit_id: string; title: string; body: string; youtube_id: string | null; sort_order: number; published: boolean }[]>`
      select id, unit_id, title, body, youtube_id, sort_order, published from lessons where id = ${lessonId}` : Promise.resolve([]),
    lessonId ? sql<{ document_id: string; page_from: number; page_to: number }[]>`
      select document_id, page_from, page_to from lesson_pages where lesson_id = ${lessonId} order by sort_order` : Promise.resolve([]),
  ]);
  return { units: [...units], docs: [...docs], lesson: lesson[0] ?? null, pages: pages.map((p) => ({ documentId: p.document_id, from: p.page_from, to: p.page_to })) };
}

// ── Student side ─────────────────────────────────────────────────

/** Every subject with how many published lessons the student has done. */
export function learnSubjects(studentId: string) {
  return sql<{ id: string; name_si: string; name_en: string; total: number; done: number }[]>`
    select s.id, s.name_si, s.name_en,
           count(l.id)::int as total,
           count(p.lesson_id)::int as done
    from subjects s
    left join units u on u.subject_id = s.id
    left join lessons l on l.unit_id = u.id and l.published
    left join lesson_progress p on p.lesson_id = l.id and p.student_id = ${studentId}
    group by s.id order by s.name_en`;
}

/** One subject for a student: units with published lessons (done or not), and live past papers. */
export async function subjectOutline(subjectId: string, studentId: string) {
  const [[subject], units, lessons, papers] = await Promise.all([
    sql<{ id: string; name_si: string; name_en: string }[]>`select id, name_si, name_en from subjects where id = ${subjectId}`,
    sql<{ id: string; name_si: string; name_en: string }[]>`
      select u.id, u.name_si, u.name_en from units u where u.subject_id = ${subjectId} order by ${unitOrder}`,
    sql<{ id: string; unit_id: string; title: string; done: boolean }[]>`
      select l.id, l.unit_id, l.title,
             exists (select 1 from lesson_progress p where p.lesson_id = l.id and p.student_id = ${studentId}) as done
      from lessons l join units u on u.id = l.unit_id
      where u.subject_id = ${subjectId} and l.published order by ${lessonOrder}`,
    sql<{ id: string; title: string; doc_type: string; year: number | null }[]>`
      select id, title, doc_type, year from documents
      where subject_id = ${subjectId} and status = 'live' and doc_type in ('past_paper', 'marking_scheme')
      order by year desc nulls last, title`,
  ]);
  if (!subject) return null;
  return {
    subject,
    units: units.map((u) => ({ ...u, lessons: lessons.filter((l) => l.unit_id === u.id) })).filter((u) => u.lessons.length),
    papers: [...papers],
  };
}

/** A published lesson for a student, with live textbook links, done state, and previous/next in the subject. */
export async function lessonForStudent(id: string, studentId: string) {
  const [l] = await sql<{
    id: string; title: string; body: string; youtube_id: string | null; unit_si: string; unit_en: string;
    subject_id: string; subject_si: string; subject_en: string; done: boolean; prev_id: string | null; next_id: string | null;
  }[]>`
    with ordered as (
      select l.id, lag(l.id) over w as prev_id, lead(l.id) over w as next_id
      from lessons l join units u on u.id = l.unit_id
      where l.published and u.subject_id = (select u2.subject_id from lessons l2 join units u2 on u2.id = l2.unit_id where l2.id = ${id})
      window w as (order by ${unitOrder}, ${lessonOrder})
    )
    select l.id, l.title, l.body, l.youtube_id, u.name_si as unit_si, u.name_en as unit_en,
           s.id as subject_id, s.name_si as subject_si, s.name_en as subject_en,
           exists (select 1 from lesson_progress p where p.lesson_id = l.id and p.student_id = ${studentId}) as done,
           o.prev_id, o.next_id
    from lessons l join units u on u.id = l.unit_id join subjects s on s.id = u.subject_id
    join ordered o on o.id = l.id
    where l.id = ${id} and l.published`;
  if (!l) return null;
  const pages = await sql<{ document_id: string; title: string; page_from: number; page_to: number }[]>`
    select p.document_id, d.title, p.page_from, p.page_to
    from lesson_pages p join documents d on d.id = p.document_id
    where p.lesson_id = ${id} and d.status = 'live' order by p.sort_order`;
  return { ...l, pages: [...pages] };
}

/** Marks a published lesson done (or not) for the student. */
export function setDone(studentId: string, lessonId: string, done: boolean) {
  return asUser(studentId, (tx) => done
    ? tx`insert into lesson_progress (lesson_id, student_id)
         select id, ${studentId} from lessons where id = ${lessonId} and published on conflict do nothing`
    : tx`delete from lesson_progress where lesson_id = ${lessonId} and student_id = ${studentId}`);
}
