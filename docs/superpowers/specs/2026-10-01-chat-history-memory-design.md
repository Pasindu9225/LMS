# A/L LMS — Sub-project 2: Chat History + Conversation Memory (Design)

**Date:** 2026-10-01
**Builds on:** `2026-09-26-rag-chatbot-design.md` (v1 listed "conversation memory" and "chat history UI" as out of scope)

## 1. Goal

Students can see and reopen their past chats, and follow-up questions keep the context of the conversation.

**Success:** a student opens `/chat`, sees their past conversations, reopens one with its citations intact, asks a follow-up that depends on earlier turns (e.g. "එහි භාවිත මොනවාද?" / "what are its uses?"), and gets a correct cited answer. The daily limit, bilingual replies and the "not in the material" reply behave as in v1.

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| Storage | New `conversations` table; `chat_logs` stays the message store | No duplicated data; admin logs unchanged; sources rebuild from `chunk_ids` |
| Subject scope | A conversation can switch subject mid-chat; each message keeps its own `subject_id` | User choice |
| Memory depth | Last 4 turns; past answers truncated to 1500 chars | Enough for follow-ups without diluting retrieval or raising cost |
| Memory placement | Both the rewrite step and the answer step | Rewrite makes retrieval work for follow-ups; answer step keeps the reply coherent |
| Delete semantics | `chat_logs.conversation_id ... on delete set null` | Cascade would let a student wipe logs to reset the daily limit and would hide them from admins |

## 3. Data model

Appended to `db/schema.sql` (idempotent; `npm run migrate` re-runs the whole file):

```sql
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_user_updated_idx on conversations (user_id, updated_at desc);

alter table chat_logs add column if not exists conversation_id uuid references conversations on delete set null;
create index if not exists chat_logs_conv_time_idx on chat_logs (conversation_id, created_at);
alter table conversations enable row level security;
```

- `title` = first question, first 80 characters.
- Existing `chat_logs` rows keep `conversation_id = null`: hidden from student history, still in admin logs. No backfill.

## 4. API: `POST /api/chat`

Body: `{ subjectId, question, conversationId? }`.

1. Auth, validation, daily limit — as v1. `conversationId`, if present, must be a UUID (else 400).
2. **No `conversationId`:** insert a `conversations` row; the first stream event is `{ type: 'conversation', id }`.
3. **With `conversationId`:** select it with `user_id = current user`; missing → 404 (same response for "not yours" and "doesn't exist"). Load the last 4 turns (`question`, `answer`) from `chat_logs` for that conversation, returned oldest first.
4. `retrieve(subjectId, question, history)` → `rewriteQuestion(question, history)`.
5. Not-found threshold, sources event, streaming, retry-once, fallback — unchanged.
6. `generateAnswer(system, user, history)`.
7. Log row includes `conversation_id`; the same transaction sets `conversations.updated_at = now()`.

Stream format (NDJSON) adds only the `conversation` event type.

## 5. Memory

**History shape:** `{ question: string; answer: string }[]`, max 4, oldest first, each answer passed through `stripCitations()` then truncated to 1500 chars.

**Rewrite step** (`lib/gemini.ts` `rewriteQuestion(q, history = [])`): when history is non-empty, `contents` is `historyBlock(history)` followed by `Question: <q>`. `REWRITE_PROMPT` gains one rule: *use the history only to resolve references (pronouns, "that", "it", omitted topic) so query_si and query_en stand alone; reply_lang is decided by the latest question only.* With empty history the request is identical to v1.

**Answer step** (`generateAnswer(system, user, history = [])`): `contents` is the alternating turns `{role:'user', text: question}`, `{role:'model', text: answer}` for each history item, then the final user message with `<sources>`. The system prompt is unchanged: only the numbered sources may be used as facts.

**Why strip citations:** a past answer's `[3]` referred to that turn's sources; left in, the model may copy numbers that don't match the current sources.

## 6. Reading and deleting — `lib/conversations.ts`

All functions take `userId` and filter by it.

- `listConversations(userId)` → `{ id, title, updated_at }[]`, newest first, limit 50.
- `getMessages(userId, convId)` → `null` if not found/not owned; otherwise turns ordered by `created_at`, each `{ question, answer, subjectId, sources }`. Sources are rebuilt from `chunk_ids` (one query joining chunks → documents → units), keeping `chunk_ids` order; a missing chunk becomes `{ n, removed: true }`.
- `deleteConversation(userId, convId)` → deletes the row where `id` and `user_id` match; no-op otherwise.

Pages call these directly (server components). Delete is a server action in `app/chat/actions.ts`. No new API routes.

## 7. UI

**Routes**
- `/chat` — new empty conversation.
- `/chat/[id]` — server page; `getMessages()`; `null` → `notFound()`.
- Both render `Chat` with props `subjects`, `conversations`, `conversationId?`, `initialMsgs`.

**Layout**
- Desktop (`md:` and up): left sidebar ~16rem — "New chat" link to `/chat`, then the conversation list (title + date, current one highlighted, delete button with `confirm()`).
- Mobile: sidebar hidden; a "History" button in the header toggles it as an overlay panel. Plain state + Tailwind.
- Header (subject select, language toggle, logout) unchanged. Changing subject does not start a new chat.

**Sending**
- On the `conversation` event: store the id in state, `window.history.replaceState(null, '', '/chat/' + id)` (no remount mid-stream), and prepend `{ id, title }` to the local sidebar list.
- Later messages send `conversationId`.

**Deleting**
- Server action, then: if it was the open conversation → navigate to `/chat`; otherwise remove it from the local list.

**Per-message subject**
- `Msg` gains `subjectId`. Live messages take the subject selected when asked; loaded messages take `chat_logs.subject_id`. Source lines show that message's subject name, not the current dropdown value.
- Removed sources render as `[n] (removed)` without a link.

**i18n** (`lib/i18n.ts`, both languages): `newChat`, `history`, `delete`, `confirmDelete`, `removed`.

## 8. Error handling

- Malformed `conversationId` → 400. Not owned / missing → 404, before any Gemini call.
- History load failure → request fails with the normal `{type:'error'}` event; never answer without memory silently.
- Stream fails after the conversation row was created → the conversation remains (possibly with no turns), shows by title, and can be continued. No cleanup.
- Delete of a not-owned or missing conversation → no-op.

## 9. Testing

1. **Unit (vitest)** — pure helpers in `lib/text.ts`:
   - `stripCitations(text)`: removes `[3]`, `[2][3]`; leaves `$[a,b]$` LaTeX and `[label](url)` links alone.
   - `buildHistory(rows)`: last 4 turns, oldest first, citations stripped, answers truncated to 1500 chars.
   - `historyBlock(history)`: the `<history>` text for the rewrite step.
2. **Eval:** `eval/questions.json` entries may include `history: { question, answer }[]`; `npm run eval` passes it to `retrieve()` and reports hit@8 as before. Entries without `history` behave as in v1.
3. **Manual end-to-end:** ask → pronoun follow-up (correct and cited) → switch subject mid-chat → refresh (chat and citations reload) → open another student's conversation URL (404) → delete a conversation (daily count unchanged).

## 10. Out of scope

- renaming conversations
- search across history
- AI-generated titles
- admin logs grouped by conversation
- pagination past 50 conversations
- backfilling old `chat_logs` into conversations
