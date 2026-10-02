# A/L LMS — Sub-project 4: Answer Flagging + Teacher Reply (Design)

**Date:** 2026-10-02
**Builds on:** chat history (`conversations`, `chat_logs.conversation_id`), migrations + audit (`asUser`, `audit_stamp`).
**Next:** role-based access will widen "admin" here to admin + teacher.

## 1. Goal

A student can send any tutor answer to a teacher (an admin, for now), with an optional note. Admins review open flags with the retrieved sources and either reply or dismiss. The student sees the reply under that answer, and the conversation is marked in the sidebar until they open it.

**Success:**
- A student flags a "not in the material" reply with a note.
- It appears at `/admin/flags` with the question, the answer, the note and the retrieved chunks.
- An admin replies.
- The student's sidebar shows a dot on that conversation. Opening it shows the reply under the answer and clears the dot.

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| Storage | Flag columns on `chat_logs` (approach A) | One flag per answer; only the asker can flag; no join |
| Who replies | Admins | Only roles today; widened to teachers in the roles sub-project |
| Explicit timestamps | `flagged_at`, `replied_at`, `replied_by` kept alongside audit columns | Audit columns hold only the last edit (seen-marking or an unlink would overwrite them) |
| Notifications | Sidebar dot only | No email/SMS in scope |
| Reply rendering | Plain text | Admin text is not markdown-rendered, so it cannot inject links or HTML |

## 3. Data — `db/migrations/V004__answer_flagging.sql`

```sql
alter table chat_logs
  add column flag_status text check (flag_status in ('open', 'answered', 'dismissed')),
  add column flag_note text check (char_length(flag_note) <= 500),
  add column flagged_at timestamptz,
  add column reply text check (char_length(reply) <= 4000),
  add column replied_at timestamptz,
  add column replied_by uuid references profiles on delete set null,
  add column reply_seen boolean not null default false;
create index chat_logs_open_flags_idx on chat_logs (flagged_at) where flag_status = 'open';
create index chat_logs_unseen_reply_idx on chat_logs (conversation_id) where flag_status = 'answered' and not reply_seen;
```

`flag_status` null = not flagged.

## 4. Server

**`lib/flags.ts`** (all writes via `asUser`):

- `flagAnswer(userId, logId, note): Promise<boolean>` — `update chat_logs set flag_status='open', flag_note=nullif(note,''), flagged_at=now() where id=$logId and user_id=$userId and flag_status is null`; returns whether one row changed.
- `replyFlag(adminId, logId, reply): Promise<boolean>` — `set flag_status='answered', reply, replied_at=now(), replied_by=adminId, reply_seen=false where id=$logId and flag_status in ('open','answered')`.
- `dismissFlag(adminId, logId): Promise<boolean>` — `set flag_status='dismissed' where id=$logId and flag_status='open'`.
- `markRepliesSeen(userId, conversationId): Promise<void>` — `set reply_seen=true where conversation_id=$c and user_id=$userId and flag_status='answered' and not reply_seen`.
- `listFlags(status: 'open'|'answered'|'dismissed')` — up to 100 rows, oldest `flagged_at` first for open, newest first otherwise; each row: id, question, answer, flag_note, flagged_at, reply, replied_at, chunk_ids, student name, subject name_en.

**Validation (`lib/text.ts`, pure):**
- `cleanNote(s: unknown): string | null` — trims; returns `''` for empty; `null` (invalid) if not a string or over 500 chars.
- `cleanReply(s: unknown): string | null` — trims; `null` if not a string, empty, or over 4000 chars.

**Server actions:**
- `app/chat/actions.ts` — `flagChat(logId: string, note: string): Promise<boolean>` — `requireUser`, `isUuid`, `cleanNote`, `flagAnswer`.
- `app/admin/actions.ts` — `replyToFlag(logId, reply)`, `dismissFlagAction(logId)` — `requireAdmin`, validation, then `lib/flags.ts`; `revalidatePath('/admin/flags')`. Invalid input throws (consistent with the other admin actions' `need()`).

**Chat stream:** `logTurn` adds `returning id`; `/api/chat` sends `{ type: 'logged', id }` after each successful log (both the answer path and the not-found path).

**Conversations:**
- `getMessages` also returns, per turn: `id`, `flagStatus`, `reply`, `repliedAt` (ISO string or null).
- `chatPageData` also returns `hasNewReply: boolean` per conversation (an `exists` subquery on the partial index).
- `/chat/[id]` calls `markRepliesSeen` after loading (the dot clears from the next render; this page load already shows the reply).

## 5. UI

**Student (`app/chat/Chat.tsx`):**
- `Msg` gains `logId?`, `flagStatus?`, `reply?`, `repliedAt?`.
- On `logged`: set the bot message's `logId`.
- `flagView(m)` (pure, `lib/text.ts`): returns `'none' | 'can-flag' | 'waiting' | 'reply' | 'reviewed'`:
  - no `logId` → `'none'`
  - no `flagStatus` → `'can-flag'`
  - `'open'` → `'waiting'`; `'answered'` → `'reply'`; `'dismissed'` → `'reviewed'`
- `can-flag`: "⚑ Ask a teacher" button → inline textarea (maxLength 500) + Send/Cancel. On success: `flagStatus='open'`. On `false`: show `flagSent` ("Already sent"). On throw: `L.error`.
- `waiting`: grey text `flagWaiting`. `reply`: bordered box, title `teacherReply` + `colomboDate(repliedAt)`, body `whitespace-pre-wrap` plain text. `reviewed`: grey `flagReviewed`.
- Sidebar: a small blue dot (`aria-label`=`teacherReply`) when `hasNewReply`; cleared locally when that conversation is the open one.
- i18n (si + en): `flag`, `flagNote`, `flagSend`, `flagCancel`, `flagSent`, `flagWaiting`, `teacherReply`, `flagReviewed`.

**Admin:**
- Nav link "Flags" in `app/admin/layout.tsx`.
- `app/admin/flags/page.tsx` (server): status from `searchParams` (default `open`), filter links, one card per flag: time · student · subject, question, answer (plain, pre-wrap), note, sources list (same rendering as `/admin/logs`, deleted chunks shown as "(chunk since re-indexed)"), and for open/answered a form (`textarea name="reply"` prefilled, Send reply) plus Dismiss for open.
- Forms post to server actions via `action={replyToFlag.bind(null, id)}`-style wrappers that take `FormData`.
- `/admin/logs`: rows with `flag_status` show a badge (`flag: open|answered|dismissed`) and the reply if any.

## 6. Error handling

- Flagging a non-owned, missing, or already-flagged answer → `false` → "Already sent" (no information about other users' rows).
- Note > 500 or reply empty/> 4000 → rejected before any write; DB checks back this up.
- Reply on a dismissed flag → `false` → action throws "Flag is not open".
- A turn whose `logged` event never arrived has no flag button.

## 7. Testing

1. **Unit (vitest):** `flagView` (all five states), `cleanNote` (trim, empty → `''`, 501 chars → null, non-string → null), `cleanReply` (empty → null, 4001 → null, trim).
2. **Throwaway DB check** (rolled back / cleaned): student flags own answer → true; second flag → false; another user's flag → false; admin reply → `answered`, `replied_by`, audit `updated_by` = admin, `reply_seen` false; `chatPageData` shows `hasNewReply`; `markRepliesSeen` clears it; dismiss on answered → false.
3. **Suite, typecheck, lint, build** green.
4. **Manual (user):** flag → `/admin/flags` → reply → student sees dot → opens → reply shown, dot gone; dismiss path shows "Reviewed by a teacher".

## 8. Out of scope

- teacher role (next sub-project), email/SMS notifications, un-flagging, multiple flags per answer, threaded back-and-forth, flag analytics.
