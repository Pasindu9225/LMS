# A/L LMS — Sub-project 1: RAG Chatbot (Design)

**Date:** 2026-09-26
**Status:** Approved in chat, pending written-spec review
**Parent spec:** `al-lms-feature-spec.md` (full product vision)

## 1. Goal

Sri Lankan A/L students ask questions (mostly in Sinhala) and get correct answers grounded only in admin-uploaded study material, with a citation to subject → unit → page.

**Success for v1:** a student asks in Sinhala (or Singlish/English) and gets a correct Sinhala answer with a page citation from the uploaded material, or an honest "not in the material" reply.

### Decomposition

The full product is split into sub-projects, each with its own spec → plan → build:

1. **RAG chatbot core (this spec)**, including minimal auth (admin/student) and subjects/units
2. Teachers, schools, escalation
3. Quizzes
4. Notes
5. Billing / usage tiers
6. Analytics dashboards

## 2. Decisions and constraints

| Decision | Choice | Reason |
|---|---|---|
| Source documents | Legacy-font (FM Abhaya etc.) and scanned PDFs | Normal text extraction is unusable → vision-LLM OCR for every page |
| AI provider | Google Gemini for OCR, embeddings and chat | Strong Sinhala OCR, multilingual embeddings, low cost, one key |
| v1 chatbot features | Grounded Q&A with citations only | No conversation memory, quiz-me, escalation or tiers in v1 |
| Auth | Supabase Auth, email + password, roles `admin` / `student` | Needed before billing; protects the Gemini quota |
| Architecture | Next.js app (Vercel) + Node worker (same repo) + Supabase | OCR is too slow for serverless timeouts |
| Language | TypeScript throughout | Solo builder, one language |

Gemini model names come from env vars (`GEMINI_OCR_MODEL`, `GEMINI_CHAT_MODEL`, `GEMINI_EMBED_MODEL`), so models can be swapped without code changes. All chat generation goes through one function (`generateAnswer`), so the provider can be changed later.

## 3. Architecture

```
Browser ──► Next.js (Vercel)
             ├─ UI: /login /signup /chat /admin/*
             ├─ API: chat, upload URL, page edit, publish
             └─ Supabase (Postgres + pgvector + Auth + Storage)
                        ▲
Worker (Node, Railway/VPS) ─┘  polls documents table → OCR → chunk → embed
```

- One repo, one database. The worker is `npm run worker` (a plain TypeScript script sharing code with the app).
- The Postgres `documents` table is the job queue. There is no separate queue service.
- All DB access happens server-side with the Supabase service key; admin routes check `profiles.role = 'admin'`. Students never query tables directly, so v1 has no RLS policies.

## 4. Data model

| Table | Columns | Notes |
|---|---|---|
| `profiles` | `id` (FK auth.users), `role` (`admin`\|`student`, default `student`), `name`, `created_at` | Created on signup |
| `subjects` | `id`, `name_si`, `name_en` | |
| `units` | `id`, `subject_id`, `name_si`, `name_en`, `sort_order` | |
| `documents` | `id`, `subject_id`, `title`, `doc_type` (`textbook`\|`past_paper`\|`marking_scheme`\|`syllabus`\|`other`), `year` (nullable), `storage_path`, `status`, `page_count`, `pages_done`, `error`, `uploaded_by`, `created_at`, `updated_at` | `updated_at` is the worker heartbeat |
| `pages` | `id`, `document_id` (ON DELETE CASCADE), `page_no`, `unit_id` (nullable), `text`, `ocr_failed` (bool), `reviewed` (bool); unique (`document_id`, `page_no`) | Admin-editable OCR output |
| `chunks` | `id`, `document_id` (ON DELETE CASCADE), `subject_id`, `unit_id`, `page_no`, `content`, `embedding vector(768)` | HNSW index, cosine distance |
| `chat_logs` | `id`, `user_id`, `subject_id`, `question`, `answer`, `chunk_ids` (uuid[]), `created_at` | Debugging, abuse cap, future analytics |

**Document status:** `queued → processing → review → live`, plus `failed` and `archived`. Only `live` documents are searched. `archived` retires a document without deleting it (this replaces full versioning in v1).

## 5. Ingestion pipeline

1. **Upload.** The admin fills in PDF, subject, title, type and year. The browser uploads directly to Supabase Storage with a signed upload URL (this avoids Vercel's ~4.5 MB body limit). A `documents` row is created with `status = queued`. Validation: PDF only, ≤ 200 MB, ≤ 1000 pages.
2. **Claim.** The worker polls every 5 s and claims one document with `UPDATE … WHERE id = (SELECT … WHERE status='queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`, setting `status = processing`. At startup and on each poll, documents in `processing` with `updated_at` older than 10 min are reset to `queued`.
3. **OCR.** The worker splits the PDF into single-page PDFs with `pdf-lib` and sends each page to Gemini (OCR model) as `application/pdf`. The prompt:
   - Transcribe exactly what is visible into Unicode Sinhala/English.
   - Keep headings; write tables as Markdown and equations/formulas as LaTeX.
   - Do not summarize, translate or add anything.
   - Read from the rendered page, not from any embedded text layer.

   Pages run 4 at a time, and each call retries 3× with exponential backoff on 429/5xx. A page that still fails is saved with `ocr_failed = true` and empty text. Pages already in `pages` are skipped, so a restarted worker resumes where it stopped. Each page increments `pages_done` and touches `updated_at`.
4. **Chunk + embed.**
   - Each page is split at blank lines into chunks of ~1200 characters (max 1500).
   - An oversized paragraph is split at sentence ends (`.` `?` `!` `।`), then hard-cut if still too long.
   - Chunks never cross pages.
   - The embedded text is `"<doc title> · <unit name>\n<chunk>"`; the stored `content` is the plain chunk.
   - Embeddings use the Gemini embedding model, task type `RETRIEVAL_DOCUMENT`, 768 dims, batches of 100, L2-normalized.
   - Then `status = review`.
5. **Review + publish.** On the admin review screen:
   - **Save a page** → delete that page's chunks, re-chunk and re-embed it synchronously in the API route, and set `reviewed = true`.
   - **Unit range** ("pages 12–40 → Unit 3") → update `pages.unit_id` and `chunks.unit_id`, then re-embed the affected pages (the unit name is part of the embedded text).
   - **Retry OCR** on a failed page → run OCR for that page synchronously, then save as above.
   - **Publish** → `status = live`. Review is optional, and edits keep working after a document is live.
   - **Delete** → remove the row (pages and chunks cascade) and the Storage file.

**Known limit:** a paragraph split across two pages becomes two chunks. If evals show misses from this, add neighbour-page overlap.

## 6. Retrieval and answering (`POST /api/chat`)

Input: `{ subjectId, question }`.

1. **Guard.** The user must be authenticated, the question must be 1–1000 characters, and there is an abuse cap of 100 questions per user per day (a count on `chat_logs` since midnight Asia/Colombo).
2. **Rewrite.** A Gemini (chat model, JSON output) call returns `{ query_si, query_en, reply_lang }`:
   - `query_si`: clean Unicode Sinhala
   - `query_en`: English, including technical terms
   - `reply_lang`: `si` or `en`, following what the student used; Singlish → `si`
3. **Retrieve.**
   - Embed both queries with task type `RETRIEVAL_QUERY`.
   - Run a pgvector cosine search for the top 8 of each, filtered to `subject_id = X` and document `status = 'live'`.
   - Merge, dedupe by chunk id keeping the best score, and take the top 8.
4. **Threshold.** If the best similarity is below `MIN_SIMILARITY` (env var, set from the eval), return the fixed "not in the material" message in `reply_lang` without an answer call.
5. **Answer.** `generateAnswer()` streams from the Gemini chat model. The system prompt:
   - You are an A/L tutor.
   - Use only the numbered sources.
   - Cite claims as `[n]`.
   - If the sources don't cover the question, say so.
   - Answer in `reply_lang`, step by step, with math/chemistry as LaTeX.

   Sources are formatted as `[n] <title> · <unit> · page <p>\n<content>` and clearly delimited as reference data.
6. **Stream** the text to the browser. A final event carries the source metadata (`n`, document title, unit, page, document id).
7. **Log** the question, answer and chunk ids to `chat_logs`.

## 7. UI

Mobile-first, Tailwind, Noto Sans Sinhala font. The UI language toggle (සිංහල / English) uses a plain translation object.

- **Public:** `/login`, `/signup` (Supabase Auth, email + password).
- **Student `/chat`:**
  - subject dropdown (last choice remembered in localStorage)
  - streaming messages with Markdown + KaTeX rendering
  - `[n]` markers linked to source cards ("Chemistry → Unit 3 → Textbook 2024, p.45")
  - tapping a card opens a signed PDF URL at `#page=N`
- **Admin (`/admin/*`, role-checked):**
  - `/admin/subjects`: CRUD for subjects and units.
  - `/admin/documents`: upload form and a document list with status, progress (`pages_done/page_count`, polled every 5 s) and errors.
  - `/admin/documents/[id]`:
    - review split view: PDF iframe at `#page=N` beside a text editor
    - previous/next page, with failed pages highlighted
    - unit range assignment
    - Retry OCR, Publish, Archive and Delete buttons
  - `/admin/logs`: recent questions with the answer and the chunks used.
- **Admin bootstrap:** sign up, then run `update profiles set role='admin' where id = '…'` in Supabase SQL.

## 8. Error handling

| Failure | Behaviour |
|---|---|
| Gemini error in chat | Retry once, then a bilingual "try again" message; not logged as an answer |
| Empty/safety-blocked answer | Fallback message, logged so it shows in `/admin/logs` |
| OCR page fails after retries | `ocr_failed = true`; the document continues; Retry OCR on the review screen |
| Worker crash | Stale `processing` docs (>10 min) are requeued; finished pages are skipped |
| Invalid upload | Rejected client- and server-side (type, size, page count) |
| Delete | Cascade to pages/chunks, Storage file removed |
| Secrets | Gemini key and Supabase service key are server-only env vars |

## 9. Testing

1. **Step 0: OCR test (go/no-go).** A script OCRs 5 real pages (legacy-font + scanned) and prints the output for a manual check. Nothing else is built until the Sinhala quality is acceptable.
2. **Unit tests (Vitest):** chunker (paragraph/sentence split, size bounds, never crosses pages); result merge/dedupe; `[n]` citation parsing.
3. **Retrieval eval (`npm run eval`):**
   - Uses a JSON file of ~30 real questions (Sinhala/Singlish/English), each with the expected document and page, plus 5 off-syllabus questions.
   - Reports hit@8 and whether off-syllabus questions fall below `MIN_SIMILARITY`.
   - Used to set the threshold, and re-run after any prompt or chunking change.
4. **Manual end-to-end:** upload → OCR → review → publish → ask → open citation.

## 10. Out of scope for v1

- conversation memory
- quiz-me mode
- teacher escalation and flagging
- usage tiers and billing
- teachers and schools
- hybrid keyword search and reranking
- full document versioning
- chat history UI
- dark mode, PWA/offline
- analytics dashboards
- automated UI/load tests
