# A/L LMS — Sub-project 7: Course content (lessons, progress, past papers) (Design)

**Date:** 2026-10-02 · **Builds on:** roles (subject scope), documents. **Next:** quizzes and assignments.

## Goal
Staff write lessons per unit: Markdown notes (Sinhala and LaTeX), an optional YouTube video, and links to textbook page ranges. Students browse Subject → Unit → Lesson, mark lessons done, see progress, and open past papers next to their marking schemes. Lessons do **not** feed the AI tutor (for now).

**Success:**
- A teacher publishes a lesson with notes, a video and textbook pages.
- A student reads it, marks it done, and the unit shows "1/N done".
- The student opens a year's paper and its marking scheme.

## Data — `V007__lessons.sql` (audit + trigger + RLS on all)
- `lessons(id, unit_id → units (restrict), title 1–200, body ≤ 50000, youtube_id char(11) null, sort_order int, published bool default false)`
- `lesson_pages(id, lesson_id → lessons cascade, document_id → documents cascade, page_from ≥ 1, page_to ≥ page_from, sort_order)`; the app checks the document is in the lesson's subject.
- `lesson_progress(lesson_id → lessons cascade, student_id → profiles cascade, pk(lesson_id, student_id))`; `created_at` = done time.
- Deleting a unit with lessons is refused (`deleteUnitIfUnused`); the Subjects page shows a lesson count instead of Delete.

## Pure helpers
- `parseYouTubeId(url)` (`lib/youtube.ts`): youtube.com/watch?v=, youtu.be/, /shorts/, /embed/, /live/ (www/m/nocookie hosts) → 11-character id; anything else → null.
- `groupPapers(docs)` (`lib/papers.ts`): past_paper + marking_scheme docs → `[{ year, papers[], schemes[] }]`, newest year first, unknown year last.

## Rules
| Action | Admin | Teacher | Student |
|---|---|---|---|
| Create/edit/reorder/publish/delete lessons | all | own subjects | ✗ |
| See drafts | all | own subjects | ✗ (404) |
| Read published lessons | ✓ | ✓ | ✓ all subjects |
| Mark done / undo | — | — | own |
| Past papers | ✓ | ✓ | live documents only |

- `requireLesson(user, lessonId)` (`lib/auth.ts`): 404 unless the lesson's subject is in the staff member's scope.
- Students see textbook links only to live documents; staff see non-live links marked "not live yet".

## Pages
- **Staff `/admin/lessons?subject=`** (nav "Lessons"): a subject picker (scoped), units in order with their lessons (position, Published/Draft, Edit), and "New lesson" per unit.
- **Staff `/admin/lessons/new?unit=` and `/admin/lessons/[id]`** (client editor):
  - Fields: title; unit (same subject); position; Markdown notes with live preview (shared `Markdown` component, the same renderer as the tutor); YouTube URL with player preview; textbook page rows (document of this subject + from–to, add/remove); Published.
  - Save returns a message; lesson and page rows save in one transaction. Delete asks for confirmation.
- **Student `/learn`:** subjects with progress (done / published).
- **Student `/learn/[subjectId]`:** units → lessons with ✓ and "x/y done", then Past papers by year with Paper / Marking scheme links (page 1).
- **Student `/learn/lesson/[id]`:** video, notes, textbook links, Mark as done / Undo, and Previous / Next within the subject. Draft or missing → 404.
- Chat header link "Lessons" (si/en). Student pages use bilingual labels.

## Testing
- Unit: `parseYouTubeId` (all formats; junk, playlist-only, wrong length, other hosts → null); `groupPapers`.
- Throwaway DB:
  - Teacher saves in their own subject, and is refused for another subject's unit and for another subject's document link.
  - Drafts are hidden from students; non-live links are hidden.
  - Done/undo and per-unit counts are correct.
  - A unit with lessons can't be deleted.
- Suite, typecheck, lint, build. Manual (user): the success journey.

## Out of scope
Rich text editor, file attachments, lessons in tutor RAG, prerequisites, time tracking, comments.
