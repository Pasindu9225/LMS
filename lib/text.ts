const TARGET = 1200;
const MAX = 1500;

const hardCut = (s: string) =>
  Array.from({ length: Math.ceil(s.length / MAX) }, (_, i) => s.slice(i * MAX, (i + 1) * MAX));

/** Split an oversized paragraph at sentence ends, hard-cutting sentences longer than MAX. */
function splitLong(p: string): string[] {
  if (p.length <= MAX) return [p];
  const sentences = (p.match(/[^.?!।]*(?:[.?!।]+|$)\s*/g) ?? []).filter(Boolean);
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    for (const piece of hardCut(s)) {
      if (cur && cur.length + piece.length > MAX) {
        out.push(cur.trim());
        cur = '';
      }
      cur += piece;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Split one page of OCR text into ~1200-char chunks (max 1500). Chunks never cross pages. */
export function chunkPage(text: string): string[] {
  const pieces = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).flatMap(splitLong);
  const chunks: string[] = [];
  let cur = '';
  for (const p of pieces) {
    if (cur && cur.length + 2 + p.length > MAX) {
      chunks.push(cur);
      cur = p;
    } else {
      cur = cur ? `${cur}\n\n${p}` : p;
    }
    if (cur.length >= TARGET) {
      chunks.push(cur);
      cur = '';
    }
  }
  // A short leftover (often just the page number) joins the previous chunk when it fits.
  const last = chunks.length - 1;
  if (cur && last >= 0 && chunks[last].length + 2 + cur.length <= MAX) chunks[last] += `\n\n${cur}`;
  else if (cur) chunks.push(cur);
  return chunks;
}

/** Merge several ranked hit lists: dedupe by id (keep best similarity), sort desc, take k. */
export function mergeResults<T extends { id: string; similarity: number }>(lists: T[][], k: number): T[] {
  const best = new Map<string, T>();
  for (const h of lists.flat()) {
    const b = best.get(h.id);
    if (!b || h.similarity > b.similarity) best.set(h.id, h);
  }
  return [...best.values()].sort((a, b) => b.similarity - a.similarity).slice(0, k);
}

/** Turn `[n]` / `[n, m]` citations into markdown links `#src-n`; invalid numbers stay as text. */
export function linkCitations(md: string, count: number): string {
  return md.replace(/\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g, (whole, nums: string) => {
    const ns = nums.split(',').map((s) => Number(s.trim()));
    if (!ns.every((n) => n >= 1 && n <= count)) return whole;
    return ns.map((n) => `[[${n}]](#src-${n})`).join('');
  });
}

export type Turn = { question: string; answer: string };
export const HISTORY_TURNS = 4;
const HISTORY_ANSWER_MAX = 1500;

/** Remove `[n]` / `[n, m]` citation markers and the space before them; markdown links and math spans ($[0, 1]$) stay. */
export const stripCitations = (md: string) =>
  md.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]*\$)/)
    .map((part, i) => (i % 2 ? part : part.replace(/ ?\[\d+(?:\s*,\s*\d+)*\](?!\()/g, '')))
    .join('');

/**
 * Model-ready history from turns ordered oldest first: the last HISTORY_TURNS turns, citations
 * stripped (their numbers referred to that turn's sources), answers capped.
 */
export const buildHistory = (turns: Turn[]): Turn[] =>
  turns.slice(-HISTORY_TURNS).map((t) => ({
    question: t.question,
    answer: stripCitations(t.answer).slice(0, HISTORY_ANSWER_MAX),
  }));

export const historyBlock = (history: Turn[]) =>
  `<history>\n${history.map((t) => `Student: ${t.question}\nTutor: ${t.answer}`).join('\n\n')}\n</history>`;

/** Conversation title: first 80 code points, so Sinhala is never split mid-character. */
export const titleFrom = (question: string) => Array.from(question.replace(/\s+/g, ' ').trim()).slice(0, 80).join('');

/** YYYY-MM-DD in Sri Lanka time (UTC+5:30, no DST). Identical on server and client, so no hydration mismatch. */
export const colomboDate = (iso: string) => new Date(Date.parse(iso) + 5.5 * 3600e3).toISOString().slice(0, 10);

export type FlagStatus = 'open' | 'answered' | 'dismissed';
export type FlagView = 'none' | 'can-flag' | 'waiting' | 'reply' | 'reviewed';

/** What the student sees under an answer. No logId = the answer was never saved, so it can't be flagged. */
export function flagView(m: { logId?: string; flagStatus?: FlagStatus | null }): FlagView {
  if (!m.logId) return 'none';
  if (!m.flagStatus) return 'can-flag';
  return ({ open: 'waiting', answered: 'reply', dismissed: 'reviewed' } as const)[m.flagStatus];
}

/** Student's optional flag note: trimmed, '' when empty, null when invalid. */
export const cleanNote = (s: unknown): string | null =>
  typeof s === 'string' && s.trim().length <= 500 ? s.trim() : null;

/** Admin reply: trimmed, null when empty or invalid. */
export const cleanReply = (s: unknown): string | null =>
  typeof s === 'string' && s.trim() && s.trim().length <= 4000 ? s.trim() : null;
