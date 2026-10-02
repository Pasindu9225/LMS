# A/L LMS — Sub-project 6: Classes, join codes, announcements (Design)

**Date:** 2026-10-02 · **Builds on:** roles (teacher subject scope). **Next:** course content.

## Goal
Teachers group students into classes. Students join with a code and read the class's announcements. Classes do **not** restrict which subjects a student can use in the tutor.

**Success:** a teacher creates a class in their subject and shares its code; a student joins with it (any case, with or without the dash) and sees the teacher's announcement; the teacher sees the student on the roster.

## Data — `V006__classes.sql` (audit columns + trigger + RLS on all)
- `classes(id, subject_id → subjects (restrict), teacher_id → profiles on delete set null, name 1–100 chars, batch_year int null 2000–2100, join_code char(8) unique, archived bool default false)`
- `class_members(class_id → classes cascade, student_id → profiles cascade, pk(class_id, student_id))`
- `announcements(id, class_id → classes cascade, body 1–2000 chars)` (poster and time = audit columns)

## Join codes — `lib/joincode.ts` (pure)
- Alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no O/0/I/1), 8 characters, `node:crypto` `randomInt`.
- `normalizeCode(s)`: uppercase, strip spaces and dashes; valid only if 8 alphabet characters, else `null`.
- `formatCode(c)` → `XXXX-XXXX` for display.
- On a unique-violation clash at insert or regenerate, retry (up to 5 times).

## Rules
| Action | Admin | Teacher | Student |
|---|---|---|---|
| Create | any subject, any teacher | own subjects, self as teacher | ✗ |
| View/manage (roster, code, announcements, archive) | all | classes they teach | ✗ |
| Reassign teacher | ✓ | ✗ | ✗ |
| Join by code / leave | — | — | ✓ (not archived) |
| Read announcements | all | own classes | classes they're in |

- `requireClass(user, classId)` (`lib/auth.ts`): 404 unless admin or `classes.teacher_id = user.id`.
- Archived classes reject joins and new announcements; existing ones stay readable.
- The poster deletes their own announcement; admins delete any.
- Actions validate and return a message string (`''` = ok) instead of throwing, so the message shows in production.

## Pages
- Staff `/admin/classes` (nav "Classes"): the list (all for admin, own for teacher) with name, subject, batch, teacher, student count and archived state; a create form (admin also picks a teacher assigned to that subject, or self).
- Staff `/admin/classes/[id]`: code (Copy, Regenerate); roster (name, email, joined, Remove); announcement post box and list (newest first, Delete per rule); Archive/Unarchive; admin-only teacher select.
- Student `/classes` (link in the chat header): Join box (messages: joined / invalid code / archived / already a member); My classes with subject, teacher, the latest 20 announcements and Leave. Sinhala + English. Announcements are plain text.

## Testing
- Unit: `newJoinCode` (length 8, alphabet only, never O/0/I/1 over many draws), `normalizeCode` (`" k7qm-2xpa "` → `K7QM2XPA`; bad length or characters → `null`), `formatCode`.
- Throwaway DB:
  - A teacher creates in their own subject and is refused for another.
  - Joining by a normalized code works; joining twice is a no-op.
  - An archived class refuses joins; regenerating makes the old code fail.
  - A teacher from another subject gets a 404 via `requireClass`.
  - A student sees only their classes' announcements; removing a student works.
- Suite, typecheck, lint, build. Manual (user): the success journey.

## Out of scope
Co-teachers, add-by-email, class-restricted subject access, assignments/quizzes, notifications, announcement editing.
