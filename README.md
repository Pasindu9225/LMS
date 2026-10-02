# A/L Tutor — RAG chatbot

Admins upload A/L PDFs (legacy-font or scanned). A worker OCRs every page with Gemini, chunks and embeds
the text into pgvector. Students ask in Sinhala, Singlish or English and get answers grounded only in the
uploaded material, with citations to subject → unit → page.

Design: `docs/superpowers/specs/2026-09-26-rag-chatbot-design.md` · Plan: `docs/superpowers/plans/2026-09-26-rag-chatbot.md`

## Setup

1. Node.js ≥ 22.9, then `npm install`.
2. Create a Supabase project. In **Authentication → URL Configuration** set Site URL to `http://localhost:3000`
   and add `http://localhost:3000/auth/callback` to Redirect URLs.
3. `cp .env.example .env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key), `SUPABASE_SERVICE_ROLE_KEY` (secret key)
   - `DATABASE_URL` — Supabase **Connect → Transaction pooler** (port 6543); URL-encode special characters in the password (`/` → `%2F`)
   - `GEMINI_API_KEY` and model names (the free tier allows only ~20 requests/day per model — enable billing for real use)
4. `npm run db:migrate` — applies pending files from `db/migrations/` (Flyway-style `V###__name.sql`) and records them in `schema_history`. Safe to re-run. Never edit an applied migration; add a new `V` file.
5. Sign up in the app, then make yourself admin in the Supabase SQL editor:
   ```sql
   update profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');
   ```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Web app on http://localhost:3000 |
| `npm run worker` | Background OCR/indexing worker — must run for uploads to be processed |
| `npm test` | Unit tests (Vitest) |
| `npm run ocr-test -- <file.pdf> <page>…` | OCR sample pages into `out/` to check quality |
| `npm run eval [file]` | Retrieval check against `eval/questions.json`; suggests `MIN_SIMILARITY` |

## Deploy

- **App → Vercel.** Import the repo and set every variable from `.env.example`. Add the Vercel URL to Supabase's
  Site URL and `<vercel-url>/auth/callback` to Redirect URLs.
- **Worker → Railway (or any VPS).** Same repo, start command `npm run worker`, same env vars. Run one instance.

## Notes

- Supabase's Free plan limits uploads to 50 MB per file; the app allows up to 200 MB (Pro plan).
- Admin workflow: **Subjects** (add subject + units) → **Documents** (upload) → open the document to review OCR
  text, assign unit page ranges, then **Publish**. Only published documents are searched.

### Chat history and memory

- Each chat is saved as a conversation (`conversations` table; turns stay in `chat_logs.conversation_id`). `/chat` starts a new one, `/chat/<id>` reopens one.
- Follow-ups use the last 4 turns, both when rewriting the question for retrieval and when answering. Citation numbers are stripped from past answers before they are sent to the model.
- Deleting a chat only unlinks its `chat_logs` rows (`on delete set null`), so the daily limit and admin logs are unaffected.
- After pulling this change, run `npm run db:migrate`.
- `eval/questions.json` entries may include `"history": [{ "question": "...", "answer": "..." }]` to evaluate follow-up retrieval.

### Migrations and audit columns

- Schema lives only in `db/migrations/V###__name.sql` (Flyway-style). `npm run db:migrate` applies pending files in order, each with its `schema_history` row in one transaction, and refuses to run if an applied file was edited (checksums ignore CRLF/LF).
- New production database: create an empty Supabase project, set `DATABASE_URL`, run `npm run db:migrate`.
- Every table has `created_at`, `created_by`, `updated_at`, `updated_by`, set by the `audit_stamp` trigger. App writes go through `asUser(userId, tx => …)` (`lib/db.ts`) so the trigger knows who acted; worker and indexing writes record `null` (system).
- Deletes are not recorded.

### Roles

- `admin`, `teacher`, `student`. Signup always creates a student; admins change roles and assign teacher subjects at `/admin/users`.
- Teachers see documents, flags and chat logs for their assigned subjects only (`subjectScope` / `requireDocument` / `requireLog` in `lib/auth.ts`); Subjects and Users are admin-only.
- First admin on a fresh database: sign up, then `npm run make-admin -- you@example.com`.

### Classes

- Staff create classes at `/admin/classes` (teachers: own subjects, as themselves; admins: any subject, any assigned teacher). Each class has a join code (`XXXX-XXXX`, no O/0/I/1), a roster and announcements; archive closes joins and posting.
- Students join at `/classes` (link in the chat header) and read their classes' announcements. Classes group students; they do not limit which subjects the tutor answers.

### Lessons and past papers

- Staff write lessons per unit at `/admin/lessons` (scoped to their subjects): Markdown notes with LaTeX and a live preview, an optional YouTube link (any normal link format; played via youtube-nocookie), and links to textbook page ranges of this subject's documents. Drafts are staff-only.
- Students browse `/learn` → subject → lesson, mark lessons done and see progress per subject and unit. Each subject page lists live past papers next to their marking schemes by year. Lessons are not used by the AI tutor.
- A unit with lessons can't be deleted.
