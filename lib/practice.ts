import { sql, asUser } from '@/lib/db';
import { generateQuizJson } from '@/lib/gemini';
import { quizSystemPrompt } from '@/lib/prompts';
import { validateQuestions, gradeQuiz, MIN_QUESTIONS, type QuizQuestion } from '@/lib/quiz';

export const DAILY_QUIZZES = 20;
const MAX_CHUNKS = 10;
const MIN_CHUNKS = 2;

export type Lang = 'si' | 'en';
export type MakeResult = { id: string } | { error: 'limit' | 'material' | 'failed' };

export async function quizzesToday(userId: string): Promise<number> {
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from practice_quizzes
    where student_id = ${userId}
      and created_at >= (date_trunc('day', now() at time zone 'Asia/Colombo') at time zone 'Asia/Colombo')`;
  return n;
}

/** Units of a subject with enough live material for a quiz. */
export function quizUnits(subjectId: string) {
  return sql<{ id: string; name_si: string; name_en: string }[]>`
    select u.id, u.name_si, u.name_en from units u
    where u.subject_id = ${subjectId} and (
      select count(*) from chunks c join documents d on d.id = c.document_id
      where c.unit_id = u.id and d.status = 'live'
    ) >= ${MIN_CHUNKS}
    order by u.sort_order, u.name_en`;
}

export async function storeQuiz(userId: string, unitId: string, lang: Lang, questions: QuizQuestion[]): Promise<string> {
  const [row] = await asUser(userId, (tx) => tx<{ id: string }[]>`
    insert into practice_quizzes (student_id, unit_id, lang, questions)
    values (${userId}, ${unitId}, ${lang}, ${sql.json(questions)}) returning id`);
  return row.id;
}

/** Picks material, asks Gemini (one retry), validates, stores. Nothing is stored on failure. */
export async function makePracticeQuiz(userId: string, unitId: string, lang: Lang): Promise<MakeResult> {
  if ((await quizzesToday(userId)) >= DAILY_QUIZZES) return { error: 'limit' };
  const chunks = await sql<{ id: string; content: string; title: string; page_no: number }[]>`
    select c.id, c.content, d.title, c.page_no from chunks c join documents d on d.id = c.document_id
    where c.unit_id = ${unitId} and d.status = 'live' order by random() limit ${MAX_CHUNKS}`;
  if (chunks.length < MIN_CHUNKS) return { error: 'material' };
  const user = `<sources>\n${chunks.map((c, i) => `[${i + 1}] ${c.title} · page ${c.page_no}\n${c.content}`).join('\n\n---\n\n')}\n</sources>`;
  const ids = chunks.map((c) => c.id);
  let questions: QuizQuestion[] = [];
  for (let attempt = 0; attempt < 2 && questions.length < MIN_QUESTIONS; attempt++) {
    questions = validateQuestions(await generateQuizJson(quizSystemPrompt(lang), user).catch(() => null), ids);
  }
  if (questions.length < MIN_QUESTIONS) return { error: 'failed' };
  return { id: await storeQuiz(userId, unitId, lang, questions) };
}

export type QuizView = {
  id: string; unit_id: string; unit_si: string; unit_en: string; subject_id: string;
  questions: QuizQuestion[]; answers: number[] | null; score: number | null; submitted_at: Date | null;
  sources: Record<string, { documentId: string; title: string; page: number }>;
};

/** The owner's quiz, or null. sources (only after submitting) maps chunk id → live textbook page. */
export async function getQuiz(userId: string, id: string): Promise<QuizView | null> {
  const [q] = await sql<Omit<QuizView, 'sources'>[]>`
    select q.id, q.unit_id, u.name_si as unit_si, u.name_en as unit_en, u.subject_id,
           q.questions, q.answers, q.score, q.submitted_at
    from practice_quizzes q join units u on u.id = q.unit_id
    where q.id = ${id} and q.student_id = ${userId}`;
  if (!q) return null;
  const sources: QuizView['sources'] = {};
  if (q.submitted_at) {
    const ids = q.questions.map((x) => x.chunkId);
    const rows = await sql<{ id: string; document_id: string; title: string; page_no: number }[]>`
      select c.id, c.document_id, d.title, c.page_no from chunks c join documents d on d.id = c.document_id
      where c.id = any(${sql.array(ids)}::uuid[]) and d.status = 'live'`;
    for (const r of rows) sources[r.id] = { documentId: r.document_id, title: r.title, page: r.page_no };
  }
  return { ...q, sources };
}

/** Marks the owner's unsubmitted quiz. 'invalid' = bad answers; 'done' = not found or already submitted. */
export async function submitQuiz(userId: string, id: string, answers: number[]): Promise<'ok' | 'invalid' | 'done'> {
  const [q] = await sql<{ questions: QuizQuestion[] }[]>`
    select questions from practice_quizzes where id = ${id} and student_id = ${userId} and submitted_at is null`;
  if (!q) return 'done';
  const graded = gradeQuiz(q.questions, answers);
  if (!graded) return 'invalid';
  const r = await asUser(userId, (tx) => tx`
    update practice_quizzes set answers = ${sql.array(answers)}::int[], score = ${graded.score}, submitted_at = now()
    where id = ${id} and student_id = ${userId} and submitted_at is null`);
  return r.count === 1 ? 'ok' : 'done';
}

export function recentQuizzes(userId: string, subjectId: string) {
  return sql<{ id: string; unit_si: string; unit_en: string; score: number | null; total: number; created_at: Date }[]>`
    select q.id, u.name_si as unit_si, u.name_en as unit_en, q.score, jsonb_array_length(q.questions) as total, q.created_at
    from practice_quizzes q join units u on u.id = q.unit_id
    where q.student_id = ${userId} and u.subject_id = ${subjectId}
    order by q.created_at desc limit 10`;
}
