# Chat History + Conversation Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Students see and reopen past chats, and follow-up questions use the last 4 turns as context in both query rewrite and answer generation.

**Architecture:** A new `conversations` table; `chat_logs` gains `conversation_id` and remains the message store. Pure history helpers live in `lib/text.ts`, DB access in a new `lib/conversations.ts`. `/api/chat` creates or continues a conversation and passes history to `rewriteQuestion` and `generateAnswer`. `/chat` and `/chat/[id]` render one `Chat` client component with a sidebar.

**Tech Stack:** Next.js 16.3 (App Router, `params` is a Promise), React 19, `postgres` (porsager) with `prepare:false`, `@google/genai`, Tailwind 4, vitest.

**Spec:** `docs/superpowers/specs/2026-10-01-chat-history-memory-design.md`

## Global Constraints

- Memory depth: last **4** turns; each past answer truncated to **1500** chars after citation stripping.
- Conversation title: first **80** characters of the first question.
- Sidebar lists at most **50** conversations, newest `updated_at` first.
- `chat_logs.conversation_id` uses `on delete set null` (never cascade): deleting a chat must not lower the daily count (100/day) or hide logs from admins.
- Every conversation query filters by the current user's id. Not-owned and missing conversations get the same response (404 / `notFound()` / no-op).
- `npm run db:migrate` re-runs all of `db/schema.sql`, so every schema statement must be idempotent.
- No new dependencies. No new API routes (reads are server components, delete is a server action).
- Read `node_modules/next/dist/docs/` before using a Next API not already used in this repo (AGENTS.md).

## Review Focus

1. **Deleting a conversation while its answer is streaming** — the log insert would hit a foreign-key error after the student already saw the answer. Expected: delete is disabled while a request is in flight (Task 5 `remove()` guards on `busy`; delete buttons are `disabled={busy}`).
2. **Old answers whose citations come in groups like `[2][3]` or `[4, 5]`** — these must not reach the model as stale numbers. Expected: all removed, while markdown links and LaTeX stay (Task 1 `stripCitations` tests).
3. **Conversation dates rendered on server vs browser** — locale/timezone differences cause a hydration mismatch. Expected: the same `YYYY-MM-DD` Sri Lanka date on both (Task 1 `colomboDate` tests).
4. **Long Sinhala first question as the title** — cutting by UTF-16 units can split a character. Expected: cut by code points, whitespace collapsed (Task 1 `titleFrom` tests).
5. **A conversation whose only request failed mid-stream** — it exists with zero turns. Expected: `/chat/<id>` opens as an empty chat that can be continued, not a 404 (Task 3 `getMessages` returns `[]` vs `null`; checked in Task 5 manual step).

---

### Task 1: History text helpers

**Files:**
- Modify: `lib/text.ts` (append)
- Test: `tests/text.test.ts` (append)

**Interfaces:**
- Produces (all exported from `@/lib/text`):
  - `type Turn = { question: string; answer: string }`
  - `const HISTORY_TURNS = 4`
  - `stripCitations(md: string): string`
  - `buildHistory(turns: Turn[]): Turn[]` — input oldest first, any length
  - `historyBlock(history: Turn[]): string`
  - `titleFrom(question: string): string`
  - `colomboDate(iso: string): string` — `YYYY-MM-DD`

- [ ] **Step 1: Write the failing tests** — append to `tests/text.test.ts`, and extend its import line to:

```ts
import { chunkPage, mergeResults, linkCitations, stripCitations, buildHistory, historyBlock, titleFrom, colomboDate } from '@/lib/text';
```

```ts
describe('stripCitations', () => {
  it('removes single and grouped citations with the space before them', () => {
    expect(stripCitations('Mole is a unit [1]. It is big [2][3] and [4, 5].')).toBe('Mole is a unit. It is big and.');
  });
  it('keeps markdown links and LaTeX brackets', () => {
    const s = 'see [docs](http://a.lk) and $[a,b]$';
    expect(stripCitations(s)).toBe(s);
  });
});

describe('buildHistory', () => {
  it('keeps the last 4 turns oldest first, strips citations, caps answers at 1500', () => {
    const turns = Array.from({ length: 6 }, (_, i) => ({ question: `q${i}`, answer: `a${i} [1]` }));
    turns[5].answer = 'x'.repeat(2000);
    const h = buildHistory(turns);
    expect(h.map((t) => t.question)).toEqual(['q2', 'q3', 'q4', 'q5']);
    expect(h[0].answer).toBe('a2');
    expect(h[3].answer.length).toBe(1500);
  });
  it('handles no turns', () => {
    expect(buildHistory([])).toEqual([]);
  });
});

describe('historyBlock', () => {
  it('formats turns inside <history>', () => {
    expect(historyBlock([{ question: 'Q1', answer: 'A1' }, { question: 'Q2', answer: 'A2' }]))
      .toBe('<history>\nStudent: Q1\nTutor: A1\n\nStudent: Q2\nTutor: A2\n</history>');
  });
});

describe('titleFrom', () => {
  it('collapses whitespace', () => {
    expect(titleFrom('  mole\n\nkiyanne   mokakda ')).toBe('mole kiyanne mokakda');
  });
  it('cuts to 80 code points', () => {
    expect(Array.from(titleFrom('ම'.repeat(100))).length).toBe(80);
  });
});

describe('colomboDate', () => {
  it('uses Sri Lanka time (UTC+5:30)', () => {
    expect(colomboDate('2026-10-01T20:00:00.000Z')).toBe('2026-10-02');
    expect(colomboDate('2026-10-01T18:00:00.000Z')).toBe('2026-10-01');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/text.test.ts`
Expected: FAIL — `stripCitations` (etc.) is not exported / not a function.

- [ ] **Step 3: Implement** — append to `lib/text.ts`:

```ts
export type Turn = { question: string; answer: string };
export const HISTORY_TURNS = 4;
const HISTORY_ANSWER_MAX = 1500;

/** Remove `[n]` / `[n, m]` citation markers and the space before them; markdown links stay. */
export const stripCitations = (md: string) => md.replace(/ ?\[\d+(?:\s*,\s*\d+)*\](?!\()/g, '');

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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/text.test.ts`
Expected: PASS (all old and new tests).

- [ ] **Step 5: Commit**

```bash
git add lib/text.ts tests/text.test.ts
git commit -m "feat: history helpers for conversation memory"
```

---

### Task 2: Memory in rewrite, retrieval, answer and eval

**Files:**
- Modify: `lib/gemini.ts` (`rewriteQuestion`, `generateAnswer`; add `rewriteContents`, `answerContents`)
- Modify: `lib/prompts.ts` (`REWRITE_PROMPT`)
- Modify: `lib/retrieval.ts` (`retrieve`)
- Modify: `scripts/eval.ts`, `eval/questions.example.json`
- Test: `tests/gemini.test.ts` (append)

**Interfaces:**
- Consumes: `Turn`, `historyBlock`, `buildHistory` from `@/lib/text` (Task 1).
- Produces:
  - `rewriteContents(q: string, history?: Turn[]): string`
  - `answerContents(user: string, history?: Turn[]): { role: 'user' | 'model'; parts: { text: string }[] }[]`
  - `rewriteQuestion(q: string, history: Turn[] = [])`
  - `generateAnswer(system: string, user: string, history: Turn[] = []): AsyncGenerator<string>`
  - `retrieve(subjectId: string, question: string, history: Turn[] = [])` — same return shape as before.
  - Callers pass history that has **already** gone through `buildHistory`.

- [ ] **Step 1: Write the failing tests** — append to `tests/gemini.test.ts`, and change its import to:

```ts
import { withRetry, embed, rewriteContents, answerContents } from '@/lib/gemini';
```

```ts
describe('rewriteContents', () => {
  it('is just the question without history', () => {
    expect(rewriteContents('What is a mole?')).toBe('What is a mole?');
  });
  it('puts the history block before the question', () => {
    expect(rewriteContents('its uses?', [{ question: 'What is a mole?', answer: 'A unit.' }]))
      .toBe('<history>\nStudent: What is a mole?\nTutor: A unit.\n</history>\n\nQuestion: its uses?');
  });
});

describe('answerContents', () => {
  it('sends only the user message without history', () => {
    expect(answerContents('U')).toEqual([{ role: 'user', parts: [{ text: 'U' }] }]);
  });
  it('sends past turns as alternating user/model turns before the user message', () => {
    expect(answerContents('U', [{ question: 'Q1', answer: 'A1' }])).toEqual([
      { role: 'user', parts: [{ text: 'Q1' }] },
      { role: 'model', parts: [{ text: 'A1' }] },
      { role: 'user', parts: [{ text: 'U' }] },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/gemini.test.ts`
Expected: FAIL — `rewriteContents` is not a function.

- [ ] **Step 3: Implement in `lib/gemini.ts`**

Add the import below the existing `@/lib/prompts` import:

```ts
import { historyBlock, type Turn } from '@/lib/text';
```

Add these two exports above `rewriteQuestion`:

```ts
/** Rewrite input: earlier turns (if any) only help resolve references like "it" or "that". */
export const rewriteContents = (q: string, history: Turn[] = []) =>
  history.length ? `${historyBlock(history)}\n\nQuestion: ${q}` : q;

/** Answer input: past turns as real chat turns, then the message holding this turn's sources. */
export const answerContents = (user: string, history: Turn[] = []) => [
  ...history.flatMap((t) => [
    { role: 'user' as const, parts: [{ text: t.question }] },
    { role: 'model' as const, parts: [{ text: t.answer }] },
  ]),
  { role: 'user' as const, parts: [{ text: user }] },
];
```

In `rewriteQuestion`, change the signature and `contents`:

```ts
export async function rewriteQuestion(
  q: string,
  history: Turn[] = [],
): Promise<{ query_si: string; query_en: string; reply_lang: 'si' | 'en' }> {
```

```ts
      contents: rewriteContents(q, history),
```

Replace `generateAnswer` with:

```ts
/** Streams answer text. The single place to change if the chat provider changes. */
export async function* generateAnswer(system: string, user: string, history: Turn[] = []): AsyncGenerator<string> {
  const stream = await ai().models.generateContentStream({
    model: model('GEMINI_CHAT_MODEL'),
    contents: answerContents(user, history),
    config: { systemInstruction: system },
  });
  for await (const chunk of stream) if (chunk.text) yield chunk.text;
}
```

- [ ] **Step 4: Add the history rule to `REWRITE_PROMPT` in `lib/prompts.ts`** — insert this line immediately before the line `Do not answer the question.`:

```
If a <history> block of earlier turns comes before the question, use it only to resolve references (it, that, එය, ඒක, an omitted topic) so query_si and query_en make sense on their own. reply_lang depends only on the latest question.
```

- [ ] **Step 5: Thread history through `retrieve` in `lib/retrieval.ts`**

Change the `@/lib/text` import to `import { mergeResults, type Turn } from '@/lib/text';` and replace `retrieve` with:

```ts
/** Rewrite (si + en, resolving references against history), embed both, search the subject's live docs, merge. Not threshold-filtered. */
export async function retrieve(subjectId: string, question: string, history: Turn[] = []) {
  const r = await rewriteQuestion(question, history);
  const [vSi, vEn] = await embed([r.query_si, r.query_en], 'RETRIEVAL_QUERY');
  const [a, b] = await Promise.all([search(subjectId, vSi), search(subjectId, vEn)]);
  return { replyLang: r.reply_lang === 'en' ? 'en' as const : 'si' as const, hits: mergeResults([[...a], [...b]], TOP_K) };
}
```

- [ ] **Step 6: Optional `history` in the eval** — in `scripts/eval.ts`:

```ts
import { buildHistory, type Turn } from '@/lib/text';

type Q = { subjectId: string; question: string; history?: Turn[]; documentId?: string; page?: number; offSyllabus?: boolean };
```

and change the retrieve call to:

```ts
    const { hits: found } = await retrieve(q.subjectId, q.question, buildHistory(q.history ?? []));
```

Append this example entry to the array in `eval/questions.example.json` (before the off-syllabus entry):

```json
  { "subjectId": "<subject uuid>", "question": "eke bhavitha mokadda?", "history": [{ "question": "What is a mole?", "answer": "A mole is the SI unit of amount of substance." }], "documentId": "<document uuid>", "page": 13 },
```

- [ ] **Step 7: Run tests, typecheck and lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all tests PASS, no type errors, no lint errors.

- [ ] **Step 8: Commit**

```bash
git add lib/gemini.ts lib/prompts.ts lib/retrieval.ts scripts/eval.ts eval/questions.example.json tests/gemini.test.ts
git commit -m "feat: conversation history in query rewrite, answer and eval"
```

---

### Task 3: Schema and conversation data access

**Files:**
- Modify: `db/schema.sql`
- Create: `lib/conversations.ts`

**Interfaces:**
- Consumes: `sql` from `@/lib/db`; `buildHistory`, `HISTORY_TURNS`, `Turn` from `@/lib/text`.
- Produces (all from `@/lib/conversations`):
  - `type Source = { n: number; documentId: string; title: string; unitSi: string | null; unitEn: string | null; page: number }`
  - `type StoredTurn = { question: string; answer: string; subjectId: string | null; sources: (Source | null)[] }` — `null` = chunk deleted since
  - `type ConversationItem = { id: string; title: string; updatedAt: string }` — ISO string
  - `toSource(n: number, c: { document_id: string; title: string; unit_si: string | null; unit_en: string | null; page_no: number }): Source`
  - `createConversation(userId: string, title: string): Promise<string>`
  - `ownsConversation(userId: string, id: string): Promise<boolean>`
  - `getHistory(id: string): Promise<Turn[]>` — already passed through `buildHistory`
  - `logTurn(t: { userId: string; subjectId: string; conversationId: string; question: string; answer: string; chunkIds: string[] }): Promise<unknown>`
  - `chatPageData(userId: string): Promise<{ subjects: { id: string; name_si: string; name_en: string }[]; conversations: ConversationItem[] }>`
  - `getMessages(userId: string, id: string): Promise<StoredTurn[] | null>` — `null` = missing or not owned; `[]` = owned but empty
  - `deleteConversation(userId: string, id: string): Promise<void>`

- [ ] **Step 1: Add the schema** — in `db/schema.sql`, directly after the `create index if not exists chat_logs_user_time_idx ...` line:

```sql

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_user_updated_idx on conversations (user_id, updated_at desc);

-- set null, not cascade: deleting a chat must not lower the daily count or hide logs from admins.
alter table chat_logs add column if not exists conversation_id uuid references conversations on delete set null;
create index if not exists chat_logs_conv_time_idx on chat_logs (conversation_id, created_at);
```

and in the RLS block add after `alter table chat_logs enable row level security;`:

```sql
alter table conversations enable row level security;
```

- [ ] **Step 2: Apply it twice (proves idempotency)**

Run: `npm run db:migrate && npm run db:migrate`
Expected: `schema applied` printed twice, no errors.

- [ ] **Step 3: Create `lib/conversations.ts`**

```ts
import { sql } from '@/lib/db';
import { buildHistory, HISTORY_TURNS, type Turn } from '@/lib/text';

export type Source = { n: number; documentId: string; title: string; unitSi: string | null; unitEn: string | null; page: number };
/** One saved question/answer pair. A null source is a chunk deleted since (document re-indexed). */
export type StoredTurn = { question: string; answer: string; subjectId: string | null; sources: (Source | null)[] };
export type ConversationItem = { id: string; title: string; updatedAt: string };

type ChunkRef = { document_id: string; title: string; unit_si: string | null; unit_en: string | null; page_no: number };
export const toSource = (n: number, c: ChunkRef): Source =>
  ({ n, documentId: c.document_id, title: c.title, unitSi: c.unit_si, unitEn: c.unit_en, page: c.page_no });

export async function createConversation(userId: string, title: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into conversations (user_id, title) values (${userId}, ${title}) returning id`;
  return row.id;
}

export async function ownsConversation(userId: string, id: string): Promise<boolean> {
  const rows = await sql`select 1 from conversations where id = ${id} and user_id = ${userId}`;
  return rows.length > 0;
}

/** The conversation's last turns, oldest first, ready for the model. */
export async function getHistory(id: string): Promise<Turn[]> {
  const rows = await sql<Turn[]>`
    select question, answer from (
      select question, answer, created_at from chat_logs
      where conversation_id = ${id} order by created_at desc limit ${HISTORY_TURNS}
    ) t order by created_at`;
  return buildHistory([...rows]);
}

/** Logs one turn and bumps the conversation in a single statement (the CTE always runs). */
export function logTurn(t: {
  userId: string; subjectId: string; conversationId: string; question: string; answer: string; chunkIds: string[];
}) {
  return sql`
    with bump as (update conversations set updated_at = now() where id = ${t.conversationId})
    insert into chat_logs (user_id, subject_id, conversation_id, question, answer, chunk_ids)
    values (${t.userId}, ${t.subjectId}, ${t.conversationId}, ${t.question}, ${t.answer}, ${sql.array(t.chunkIds)}::uuid[])`;
}

export async function chatPageData(userId: string) {
  const [subjects, convs] = await Promise.all([
    sql<{ id: string; name_si: string; name_en: string }[]>`select id, name_si, name_en from subjects order by name_en`,
    sql<{ id: string; title: string; updated_at: Date }[]>`
      select id, title, updated_at from conversations
      where user_id = ${userId} order by updated_at desc limit 50`,
  ]);
  const conversations: ConversationItem[] = convs.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updated_at.toISOString() }));
  return { subjects: [...subjects], conversations };
}

/** All turns with sources rebuilt from chunk_ids. null = missing or not this user's; [] = theirs but empty. */
export async function getMessages(userId: string, id: string): Promise<StoredTurn[] | null> {
  if (!(await ownsConversation(userId, id))) return null;
  const rows = await sql<{ question: string; answer: string; subject_id: string | null; chunk_ids: string[] }[]>`
    select question, answer, subject_id, chunk_ids from chat_logs
    where conversation_id = ${id} order by created_at`;
  const ids = [...new Set(rows.flatMap((r) => r.chunk_ids))];
  const chunks = ids.length ? await sql<(ChunkRef & { id: string })[]>`
    select c.id, c.document_id, c.page_no, d.title, u.name_si as unit_si, u.name_en as unit_en
    from chunks c join documents d on d.id = c.document_id left join units u on u.id = c.unit_id
    where c.id = any(${sql.array(ids)}::uuid[])` : [];
  const byId = new Map(chunks.map((c) => [c.id, c]));
  return rows.map((r) => ({
    question: r.question,
    answer: r.answer,
    subjectId: r.subject_id,
    sources: r.chunk_ids.map((cid, i) => {
      const c = byId.get(cid);
      return c ? toSource(i + 1, c) : null;
    }),
  }));
}

export async function deleteConversation(userId: string, id: string) {
  await sql`delete from conversations where id = ${id} and user_id = ${userId}`;
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add db/schema.sql lib/conversations.ts
git commit -m "feat: conversations table and conversation data access"
```

---

### Task 4: Chat API with conversations and memory

**Files:**
- Modify: `app/api/chat/route.ts` (full replacement below)

**Interfaces:**
- Consumes: `createConversation`, `ownsConversation`, `getHistory`, `logTurn`, `toSource` (Task 3); `titleFrom` (Task 1); `retrieve(subjectId, question, history)` and `generateAnswer(system, user, history)` (Task 2).
- Produces: `POST /api/chat` accepts `{ subjectId, question, conversationId? }`. NDJSON events: `{type:'conversation', id}` (first event, only when a new conversation was created), then `sources`, `text`, `error` as before. Responses: 400 malformed body or `conversationId`; 404 conversation not owned or missing; 429 daily limit.

- [ ] **Step 1: Replace `app/api/chat/route.ts`**

```ts
import { getUser } from '@/lib/auth';
import { sql, isUuid } from '@/lib/db';
import { retrieve, buildUserMessage } from '@/lib/retrieval';
import { generateAnswer } from '@/lib/gemini';
import { answerSystemPrompt, NOT_FOUND, FALLBACK } from '@/lib/prompts';
import { createConversation, ownsConversation, getHistory, logTurn, toSource } from '@/lib/conversations';
import { titleFrom } from '@/lib/text';

export const maxDuration = 60;
const DAILY_LIMIT = 100;
const MIN_SIMILARITY = Number(process.env.MIN_SIMILARITY ?? 0.5);

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const body = await req.json().catch(() => ({}));
  const subjectId = body?.subjectId;
  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  const givenConvId = body?.conversationId ?? null;
  if (!isUuid(subjectId) || !question || question.length > 1000) return new Response('Bad request', { status: 400 });
  if (givenConvId !== null && !isUuid(givenConvId)) return new Response('Bad request', { status: 400 });
  // Same 404 for "not yours" and "doesn't exist", before any Gemini call.
  if (givenConvId && !(await ownsConversation(user.id, givenConvId))) return new Response('Not found', { status: 404 });

  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from chat_logs
    where user_id = ${user.id}
      and created_at >= (date_trunc('day', now() at time zone 'Asia/Colombo') at time zone 'Asia/Colombo')`;
  if (n >= DAILY_LIMIT) return new Response('Daily limit reached', { status: 429 });

  const conversationId: string = givenConvId ?? (await createConversation(user.id, titleFrom(question)));
  const log = (answer: string, chunkIds: string[]) =>
    logTurn({ userId: user.id, subjectId, conversationId, question, answer, chunkIds });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctl) {
      const send = (o: object) => ctl.enqueue(enc.encode(JSON.stringify(o) + '\n'));
      try {
        if (!givenConvId) send({ type: 'conversation', id: conversationId });
        // A history load failure fails the request: never silently answer a follow-up without memory.
        const history = givenConvId ? await getHistory(conversationId) : [];
        const { replyLang, hits } = await retrieve(subjectId, question, history);
        if ((hits[0]?.similarity ?? 0) < MIN_SIMILARITY) {
          send({ type: 'text', text: NOT_FOUND[replyLang] });
          await log(NOT_FOUND[replyLang], []);
          return;
        }
        send({ type: 'sources', sources: hits.map((h, i) => toSource(i + 1, h)) });

        let answer = '';
        for (let attempt = 0; ; attempt++) {
          try {
            for await (const t of generateAnswer(answerSystemPrompt(replyLang), buildUserMessage(hits, question), history)) {
              answer += t;
              send({ type: 'text', text: t });
            }
            break;
          } catch (e) {
            if (answer || attempt > 0) throw e; // retry once, only if nothing was streamed yet
          }
        }
        if (!answer.trim()) {
          answer = FALLBACK[replyLang];
          send({ type: 'text', text: answer });
        }
        await log(answer, hits.map((h) => h.id));
      } catch (e) {
        console.error('chat failed', e);
        send({ type: 'error' });
      } finally {
        ctl.close();
      }
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (`app/chat/Chat.tsx` still compiles: it never sends `conversationId`, so the API treats every message as a new conversation until Task 5.)

- [ ] **Step 3: Smoke-test the validation paths** — start `npm run dev`, log in as a student in the browser, then in the browser devtools console on `http://localhost:3000/chat` run:

```js
const post = (b) => fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.status);
const sid = document.querySelector('select').value;
console.log(await post({ subjectId: sid, question: 'hi', conversationId: 'nope' }));                                   // 400
console.log(await post({ subjectId: sid, question: 'hi', conversationId: '00000000-0000-0000-0000-000000000000' })); // 404
```

Expected: `400` then `404`.

- [ ] **Step 4: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat: chat API creates and continues conversations with memory"
```

---

### Task 5: History UI

**Files:**
- Create: `app/chat/actions.ts`
- Create: `app/chat/[id]/page.tsx`
- Modify: `app/chat/page.tsx` (full replacement)
- Modify: `app/chat/Chat.tsx` (full replacement)
- Modify: `lib/i18n.ts` (add 5 keys per language)

**Interfaces:**
- Consumes: `chatPageData`, `getMessages`, `deleteConversation`, types `Source`, `StoredTurn`, `ConversationItem` (Task 3); `linkCitations`, `titleFrom`, `colomboDate` (Task 1); `isUuid` from `@/lib/db`; `requireUser` from `@/lib/auth`; the `conversation` stream event (Task 4).
- Produces: `deleteChat(id: string): Promise<void>` server action; `Chat` props `{ subjects, conversations, conversationId?, initialTurns }`.

- [ ] **Step 1: Add i18n keys** — in `lib/i18n.ts`, add to the `si` object (after `empty`):

```ts
    newChat: 'නව සංවාදය', history: 'ඉතිහාසය', delete: 'මකන්න',
    confirmDelete: 'මෙම සංවාදය මකන්නද?', removed: 'ඉවත් කර ඇත',
```

and to the `en` object (after `empty`):

```ts
    newChat: 'New chat', history: 'History', delete: 'Delete',
    confirmDelete: 'Delete this conversation?', removed: 'removed',
```

- [ ] **Step 2: Create `app/chat/actions.ts`**

```ts
'use server';
import { requireUser } from '@/lib/auth';
import { isUuid } from '@/lib/db';
import { deleteConversation } from '@/lib/conversations';

export async function deleteChat(id: string) {
  const user = await requireUser();
  if (!isUuid(id)) return;
  await deleteConversation(user.id, id); // no-op when it isn't this user's
}
```

- [ ] **Step 3: Replace `app/chat/page.tsx`**

```tsx
import { requireUser } from '@/lib/auth';
import { chatPageData } from '@/lib/conversations';
import Chat from './Chat';

export default async function ChatPage() {
  const user = await requireUser();
  return <Chat {...await chatPageData(user.id)} initialTurns={[]} />;
}
```

- [ ] **Step 4: Create `app/chat/[id]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { isUuid } from '@/lib/db';
import { chatPageData, getMessages } from '@/lib/conversations';
import Chat from '../Chat';

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [turns, data] = await Promise.all([getMessages(user.id, id), chatPageData(user.id)]);
  if (!turns) notFound();
  // key: moving between /chat/a and /chat/b reuses this page, so remount to reset chat state.
  return <Chat key={id} {...data} conversationId={id} initialTurns={turns} />;
}
```

- [ ] **Step 5: Replace `app/chat/Chat.tsx`**

```tsx
'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { linkCitations, titleFrom, colomboDate } from '@/lib/text';
import { t, type Lang } from '@/lib/i18n';
import type { Source, StoredTurn, ConversationItem } from '@/lib/conversations';
import { deleteChat } from './actions';

type Subject = { id: string; name_si: string; name_en: string };
type Msg = { role: 'user' | 'bot'; text: string; sources: (Source | null)[]; subjectId: string | null };

const pdfUrl = (s: Source) => `/api/pdf/${s.documentId}?page=${s.page}`;
const toMsgs = (turns: StoredTurn[]): Msg[] => turns.flatMap((x) => [
  { role: 'user' as const, text: x.question, sources: [], subjectId: x.subjectId },
  { role: 'bot' as const, text: x.answer, sources: x.sources, subjectId: x.subjectId },
]);
// Full page load, not client navigation: after replaceState the router still holds the
// /chat tree, so a soft navigation to /chat would keep the old messages on screen.
const openNewChat = () => window.location.assign('/chat');

// Remembered preferences: localStorage when available, in-memory otherwise (private mode).
const mem = new Map<string, string>();
const listeners = new Set<() => void>();
const load = (k: string) => { if (mem.has(k)) return mem.get(k)!; try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
function useStored(key: string): [string, (v: string) => void] {
  const value = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => load(key),
    () => '',
  );
  return [value, (v) => {
    mem.set(key, v);
    try { localStorage.setItem(key, v); } catch { /* private mode */ }
    listeners.forEach((l) => l());
  }];
}

export default function Chat({ subjects, conversations, conversationId, initialTurns }: {
  subjects: Subject[]; conversations: ConversationItem[]; conversationId?: string; initialTurns: StoredTurn[];
}) {
  const [storedLang, setLang] = useStored('lang');
  const [storedSubject, setSubjectId] = useStored('subject');
  const lang: Lang = storedLang === 'en' ? 'en' : 'si';
  const subjectId = subjects.some((s) => s.id === storedSubject) ? storedSubject : subjects[0]?.id ?? '';
  const [convId, setConvId] = useState(conversationId);
  const [convs, setConvs] = useState(conversations);
  const [msgs, setMsgs] = useState(() => toMsgs(initialTurns));
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const L = t[lang];
  const subjectName = (id: string | null) => {
    const s = subjects.find((x) => x.id === id);
    return s ? (lang === 'si' ? s.name_si : s.name_en) : '—';
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' }); // returns a Promise in newer Chrome; must not be returned
  }, [msgs]);

  const inFlight = useRef(false);

  // Move a conversation to the top of the sidebar, adding it if new.
  const touch = (id: string, title: string) => setConvs((cs) => [
    { id, title: cs.find((c) => c.id === id)?.title ?? title, updatedAt: new Date().toISOString() },
    ...cs.filter((c) => c.id !== id),
  ]);

  // Plain submit handler, not <form action>: React runs actions as transitions, which delays the
  // message-append below while streamed updates apply immediately (seen as an "undefined…" answer).
  async function ask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const question = String(new FormData(form).get('q') ?? '').trim();
    if (!question || !subjectId || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    form.reset();
    const askConv = convId;
    const askSubject = subjectId;
    if (askConv) touch(askConv, '');
    let botIndex = -1;
    setMsgs((ms) => {
      botIndex = ms.length + 1;
      return [...ms, { role: 'user', text: question, sources: [], subjectId: askSubject }, { role: 'bot', text: '', sources: [], subjectId: askSubject }];
    });
    const updateBot = (f: (m: Msg) => Msg) => setMsgs((ms) => ms.map((m, i) => (i === botIndex ? f(m) : m)));
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId: askSubject, question, conversationId: askConv }),
      });
      if (!res.ok || !res.body) {
        updateBot((m) => ({ ...m, text: res.status === 429 ? L.limit : L.error }));
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === 'conversation') {
            setConvId(ev.id);
            touch(ev.id, titleFrom(question));
            window.history.replaceState(null, '', `/chat/${ev.id}`); // no remount mid-stream
          } else if (ev.type === 'sources') updateBot((m) => ({ ...m, sources: ev.sources }));
          else if (ev.type === 'text') updateBot((m) => ({ ...m, text: m.text + ev.text }));
          else if (ev.type === 'error') updateBot((m) => ({ ...m, text: (m.text ? m.text + '\n\n' : '') + L.error }));
        }
      }
    } catch {
      updateBot((m) => ({ ...m, text: L.error }));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  // Blocked while busy: deleting mid-stream would make the turn's log insert fail.
  async function remove(id: string) {
    if (inFlight.current || !confirm(L.confirmDelete)) return;
    try {
      await deleteChat(id);
    } catch {
      alert(L.error);
      return;
    }
    if (id === convId) openNewChat();
    else setConvs((cs) => cs.filter((c) => c.id !== id));
  }

  return (
    <div className="flex h-dvh">
      <aside className={`${showHistory ? 'fixed inset-0 z-10 flex' : 'hidden'} flex-col border-r bg-white md:static md:flex md:w-64`}>
        <div className="flex items-center gap-2 border-b p-3">
          <button onClick={openNewChat} className="flex-1 rounded border px-2 py-1 text-sm">+ {L.newChat}</button>
          <button onClick={() => setShowHistory(false)} aria-label="Close" className="px-2 md:hidden">✕</button>
        </div>
        <nav aria-label={L.history} className="flex-1 overflow-y-auto p-2">
          {convs.map((c) => (
            <div key={c.id} className={`flex items-center rounded ${c.id === convId ? 'bg-gray-100' : ''}`}>
              <Link
                href={`/chat/${c.id}`} prefetch={false} onClick={() => setShowHistory(false)}
                className="min-w-0 flex-1 p-2 text-sm"
              >
                <span className="block truncate">{c.title}</span>
                <span className="text-xs text-gray-500">{colomboDate(c.updatedAt)}</span>
              </Link>
              <button
                onClick={() => remove(c.id)} disabled={busy} aria-label={`${L.delete}: ${c.title}`}
                className="px-2 text-gray-400 hover:text-red-600 disabled:opacity-30"
              >✕</button>
            </div>
          ))}
        </nav>
      </aside>

      <div className="mx-auto flex h-dvh min-w-0 max-w-3xl flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b p-3">
          <button onClick={() => setShowHistory(true)} className="rounded border px-2 py-1 text-sm md:hidden">{L.history}</button>
          <h1 className="mr-auto font-semibold">{L.title}</h1>
          <select
            aria-label={L.subject} value={subjectId} className="rounded border p-1 text-sm"
            onChange={(e) => setSubjectId(e.target.value)}
          >
            {subjects.map((s) => <option key={s.id} value={s.id}>{lang === 'si' ? s.name_si : s.name_en}</option>)}
          </select>
          <button
            className="rounded border px-2 py-1 text-sm"
            onClick={() => setLang(lang === 'si' ? 'en' : 'si')}
          >{lang === 'si' ? 'English' : 'සිංහල'}</button>
          <form action="/auth/signout" method="post"><button className="text-sm text-gray-600">{L.logout}</button></form>
        </header>

        <main className="flex-1 space-y-4 overflow-y-auto p-3">
          {!subjects.length && <p className="text-gray-600">{L.noSubjects}</p>}
          {!msgs.length && subjects.length > 0 && <p className="text-gray-600">{L.empty}</p>}
          {msgs.map((m, i) => m.role === 'user' ? (
            <div key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg bg-blue-600 p-3 text-white">{m.text}</div>
          ) : (
            <div key={i} className="max-w-[95%] rounded-lg bg-gray-100 p-3">
              {m.text ? (
                <div className="md">
                  <ReactMarkdown
                    remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}
                    components={{
                      a: ({ href, children }) => {
                        const n = href?.match(/^#src-(\d+)$/)?.[1];
                        if (!n) return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
                        const s = m.sources[Number(n) - 1];
                        return s ? <a href={pdfUrl(s)} target="_blank" rel="noreferrer">{children}</a> : <span>{children}</span>;
                      },
                    }}
                  >{linkCitations(m.text, m.sources.length)}</ReactMarkdown>
                </div>
              ) : <p className="text-gray-500">{L.thinking}</p>}
              {m.sources.length > 0 && (
                <div className="mt-3 border-t pt-2">
                  <p className="mb-1 text-xs font-semibold text-gray-600">{L.sources}</p>
                  <ol className="space-y-1 text-xs">
                    {m.sources.map((s, j) => (
                      <li key={j}>
                        {s ? (
                          <a href={pdfUrl(s)} target="_blank" rel="noreferrer" className="text-blue-600">
                            [{s.n}] {subjectName(m.subjectId)}
                            {' → '}{(lang === 'si' ? s.unitSi : s.unitEn) ?? s.unitSi ?? s.unitEn ?? '—'}
                            {' → '}{s.title}, {L.page} {s.page}
                          </a>
                        ) : <span className="text-gray-500">[{j + 1}] ({L.removed})</span>}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          ))}
          <div ref={endRef} />
        </main>

        <form onSubmit={ask} className="flex gap-2 border-t p-3">
          <textarea
            name="q" required maxLength={1000} rows={2} placeholder={L.placeholder}
            className="flex-1 resize-none rounded border p-2"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
          />
          <button disabled={busy || !subjectId} className="rounded bg-blue-600 px-4 text-white disabled:opacity-50">{L.send}</button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Tests, typecheck, lint, build**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass; the build output lists `/chat` and `/chat/[id]`.

- [ ] **Step 7: Manual end-to-end** (`npm run dev`, logged in as a student, with at least one live document)

1. On `/chat`, ask a question the material answers. The URL becomes `/chat/<id>` and the chat appears at the top of the sidebar.
2. Ask a pronoun follow-up, e.g. "eke bhavitha mokadda?" / "what are its uses?". Expected: answer about the same topic, with valid `[n]` citations.
3. Switch the subject dropdown and ask another question in the same chat. Old messages' source lines keep the old subject name.
4. Refresh. Same messages, citations still open the PDF at the right page, no hydration warnings in the console.
5. Start a new chat, then in devtools set the network to Offline and send a question (error shown). Back online, open that chat from the sidebar if it appears. It opens empty, not a 404, and a new question works.
6. Log in as a second student and open the first student's `/chat/<id>`. Expected: 404 page.
7. Note today's count with `select count(*) from chat_logs where user_id = '<student id>'`, delete a chat from the sidebar, run it again. Expected: same count. While an answer is streaming, the delete buttons are disabled.
8. Narrow the window below 768px. The sidebar hides, "History" opens it as an overlay, and picking a chat closes it.

- [ ] **Step 8: Commit**

```bash
git add app/chat lib/i18n.ts
git commit -m "feat: chat history sidebar, saved conversations and delete"
```

---

### Task 6: Docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the new behavior** — add to `README.md`, in the section that describes the student chat (or at the end if there is none):

```markdown
### Chat history and memory

- Each chat is saved as a conversation (`conversations` table; turns stay in `chat_logs.conversation_id`). `/chat` starts a new one, `/chat/<id>` reopens one.
- Follow-ups use the last 4 turns, both when rewriting the question for retrieval and when answering. Citation numbers are stripped from past answers before they are sent to the model.
- Deleting a chat only unlinks its `chat_logs` rows (`on delete set null`), so the daily limit and admin logs are unaffected.
- After pulling this change, run `npm run db:migrate`.
- `eval/questions.json` entries may include `"history": [{ "question": "...", "answer": "..." }]` to evaluate follow-up retrieval.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: chat history and memory"
```
