export type QuizQuestion = { question: string; options: string[]; answer: number; explanation: string; chunkId: string };
export type PublicQuestion = { question: string; options: string[] };

export const QUIZ_SIZE = 5;
export const MIN_QUESTIONS = 3;

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const isIndex = (v: unknown, max: number) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < max;

/**
 * Keeps only well-formed AI questions: non-empty text, 4 distinct options, one valid answer,
 * an explanation and a real source (1-based → chunk id). At most QUIZ_SIZE.
 */
export function validateQuestions(raw: unknown, chunkIds: string[]): QuizQuestion[] {
  const list = (raw as { questions?: unknown })?.questions;
  if (!Array.isArray(list)) return [];
  const out: QuizQuestion[] = [];
  for (const r of list as Record<string, unknown>[]) {
    const question = text(r?.question), explanation = text(r?.explanation);
    const options = Array.isArray(r?.options) ? (r.options as unknown[]).map(text) : [];
    const distinct = new Set(options.map((o) => o.toLowerCase())).size === 4;
    const source = r?.source as number;
    if (!question || !explanation || options.length !== 4 || options.some((o) => !o) || !distinct) continue;
    if (!isIndex(r.answer, 4) || !Number.isInteger(source) || source < 1 || source > chunkIds.length) continue;
    out.push({ question, options, answer: r.answer as number, explanation, chunkId: chunkIds[source - 1] });
    if (out.length === QUIZ_SIZE) break;
  }
  return out;
}

/** What the browser gets before submitting: no answers, explanations or sources. */
export const publicQuestions = (qs: QuizQuestion[]): PublicQuestion[] => qs.map(({ question, options }) => ({ question, options }));

/** null unless there is exactly one valid choice per question. */
export function gradeQuiz(qs: QuizQuestion[], answers: unknown[]): { score: number; correct: boolean[] } | null {
  if (answers.length !== qs.length || !answers.every((a) => isIndex(a, 4))) return null;
  const correct = qs.map((q, i) => q.answer === answers[i]);
  return { score: correct.filter(Boolean).length, correct };
}

/** Fisher–Yates over the options, answer index following its text: models favour putting the answer first. */
export function shuffleOptions(q: QuizQuestion, rand: () => number = Math.random): QuizQuestion {
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { ...q, options: order.map((k) => q.options[k]), answer: order.indexOf(q.answer) };
}
