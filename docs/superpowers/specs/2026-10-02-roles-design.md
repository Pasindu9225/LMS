# A/L LMS — Sub-project 5: Roles (admin / teacher / student) (Design)

**Date:** 2026-10-02 · **Builds on:** migrations + audit, answer flagging. **Next:** classes and enrollment.

## Goal
Three roles. Admins do everything. Teachers handle documents, flags and chat logs **for their assigned subjects only**. Students chat. Public signup always creates a student; an admin changes roles on `/admin/users`.

**Success:** an admin makes a signed-up user a teacher of one subject. That teacher sees only that subject's documents, flags and logs, never Subjects or Users, and gets a 404 for anything else. A student gets a 404 on every `/admin` page and action.

## Data — `V005__roles.sql`
- `profiles.role` check → `('admin', 'teacher', 'student')`.
- `teacher_subjects (teacher_id → profiles on delete cascade, subject_id → subjects on delete cascade, primary key (teacher_id, subject_id))`, plus the audit columns, the `audit_stamp` trigger and RLS.
- `npm run make-admin -- <email>` (`scripts/make-admin.ts`): promotes an existing signed-up user to admin; no-op if they already are; exits non-zero if no such user. Used to bootstrap a fresh production database.

## Authorization — `lib/auth.ts`
- `AppUser.role: 'admin' | 'teacher' | 'student'`.
- `requireStaff()`: admin or teacher, else `notFound()`.
- `subjectScope(user): Promise<string[] | null>`: `null` = all (admin); a teacher's subject ids otherwise.
- `requireSubject(user, subjectId)`, `requireDocument(user, documentId) → { subject_id }`, `requireLog(user, logId)`: `notFound()` when missing or out of scope.
- Pure `canEditRole({ actorId, targetId, targetRole, newRole, adminCount })`: returns an error message, or `null` when allowed. Blocks demoting yourself, and demoting the last admin.

| Area | Admin | Teacher |
|---|---|---|
| Documents (list, upload, review, OCR retry, unit ranges, status, delete) | all | own subjects |
| Flags (queue, reply, dismiss) | all | own subjects |
| Chat logs | all | own subjects |
| Subjects & units, Users | ✓ | ✗ (404) |
| Non-live PDFs via `/api/pdf` | all | own subjects |

- URLs stay `/admin/*`. The layout uses `requireStaff`; the nav hides Subjects and Users from teachers.
- Home redirect: admin → `/admin/documents`, teacher → `/admin/flags`, student → `/chat`.
- A teacher with no subjects sees "No subjects assigned yet. Ask an admin." on staff pages.
- Teachers can use `/chat` as normal users.

## Users page — `/admin/users` (admin)
- Search by name or email (`auth.users.email`, joined server-side); 50 per page, newest first.
- Each row shows name, email, role and subjects, plus a form: role select, subject checkboxes (used when the role is teacher), and Save.
- `saveUserRole(fd)` runs as one `asUser` transaction: validate the role and subject ids, run `canEditRole`, update the role, then replace `teacher_subjects` (cleared unless the new role is teacher).

## Testing
- Unit: `canEditRole`.
- Throwaway DB check:
  - `subjectScope` returns null for an admin and the assigned ids for a teacher.
  - `requireDocument` is out of scope for another subject's document.
  - Saving a role replaces the assignments; demoting clears them; audit `updated_by` is the admin.
- `make-admin` run twice on dev (second is a no-op).
- Suite, typecheck, lint, build.
- Manual (user): the teacher and student journeys from Success.

## Out of scope
Email invites, parent and editor roles, per-teacher permissions beyond subject scope, classes.
