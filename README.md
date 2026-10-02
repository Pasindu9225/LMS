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
