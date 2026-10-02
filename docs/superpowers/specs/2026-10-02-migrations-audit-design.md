# A/L LMS — Sub-project 3: Versioned Migrations + Audit Columns (Design)

**Date:** 2026-10-02
**Precedes:** answer flagging (its schema will ship as the next migration), then role-based access.

## 1. Goal

1. A clean production database can be built from the repository alone, by running `npm run db:migrate` against an empty Supabase project.
2. Every table records who created and who last edited each row, and when.

**Success:**
- `npm run db:migrate` on an empty Supabase project builds the full schema.
- On the existing dev database, the first run records V001 (no-op) and applies V002; the second run reports "up to date".
- An admin edit sets `updated_by` to that admin; a worker write sets it to null.

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| Migration tool | Flyway-style runner in Node (`V###__name.sql`, history table, checksums) | No Java/Docker; the files stay compatible with real Flyway later (user choice) |
| Recording "who" | Triggers + a per-transaction setting `app.user_id` set by `asUser()` | The database sets the audit columns on every table, so no write can forget them; the app connects as one Postgres role, so the user id must be passed in |
| Baseline | V001 = current `db/schema.sql`, unchanged and idempotent | The existing dev database needs no reset |
| `documents.uploaded_by` | Copied into `created_by`, then dropped | One place for "who uploaded it" |
| Deleted rows | Not recorded | That needs a change-history log, which is out of scope |

## 3. Migration runner

**Files:** `db/migrations/V<int>__<description>.sql`. Description = letters, digits, underscores.

**Pure logic — `lib/migrations.ts`:**

```ts
export type MigrationFile = { version: number; description: string; filename: string; sql: string; checksum: string };
export type Applied = { version: number; checksum: string };

parseFilename(name): { version, description } | null
checksum(sql): string  // sha256 hex
planMigrations(files: MigrationFile[], applied: Applied[]): MigrationFile[]  // pending, ascending by version
```

`planMigrations` throws on:
- a filename that doesn't match the pattern (the message names it)
- two files with the same version
- an applied version whose file checksum differs ("V3 was edited after it was applied; add a new migration instead")
- an applied version with no file ("V3 is applied but its file is missing")

**Runner — `scripts/migrate.ts`** (`npm run db:migrate`, unchanged command):

1. `create table if not exists schema_history (version int primary key, description text not null, checksum text not null, installed_at timestamptz not null default now(), execution_ms int not null)`.
2. Read `db/migrations/*.sql`, select applied rows, call `planMigrations`.
3. For each pending file: in one `sql.begin` transaction, run `tx.unsafe(file.sql)` and insert its history row. A failure rolls back that file and stops the run with a non-zero exit.
4. Print `V1 baseline … applied (123 ms)` per file, or `up to date`.

There is no concurrency lock (one deploy runs migrations at a time); this is marked with a `ponytail:` comment.

## 4. V001__baseline.sql

The current `db/schema.sql` content moved via `git mv` with no edits. `db/schema.sql` no longer exists.

## 5. V002__audit_columns.sql

**Columns:** for each of `profiles, subjects, units, documents, pages, chunks, chat_logs, conversations`, add whichever columns are missing:

```sql
created_at timestamptz not null default now()
created_by uuid references profiles on delete set null
updated_at timestamptz not null default now()
updated_by uuid references profiles on delete set null
```

Existing rows get the migration time for the new timestamps and null for `_by`.

**`documents.uploaded_by`:** `update documents set created_by = uploaded_by;` then `alter table documents drop column uploaded_by;` (this runs before the triggers exist, so the update is not stamped).

**Trigger function:**

```sql
create or replace function public.audit_stamp() returns trigger language plpgsql as $$
declare actor uuid := nullif(current_setting('app.user_id', true), '')::uuid;
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := coalesce(new.created_by, actor);
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := case when tg_op = 'INSERT' then new.created_by else actor end;
  return new;
end $$;
```

The function is attached `before insert or update ... for each row` on all 8 tables, as `audit_stamp`.

**Signup:** `handle_new_user()` is replaced so the new profile row is inserted with `created_by = new.id` (the person signed themselves up).

## 6. Application wiring

**`lib/db.ts`:**

```ts
/** Runs fn in a transaction tagged with the acting user; the audit trigger records them as created_by/updated_by. */
export const asUser = <T>(userId: string, fn: (tx: postgres.TransactionSql) => Promise<T>) =>
  sql.begin(async (tx) => { await tx`select set_config('app.user_id', ${userId}, true)`; return fn(tx); });
```

The `true` argument makes the setting transaction-local. This is required behind Supabase's transaction pooler, so one user's id never leaks into another request.

**Callers:**
- `app/admin/actions.ts`: every write goes through `asUser(admin.id, …)` — subjects, units, document insert/status/delete, page text edit, OCR retry (only the update, not the Gemini call), unit ranges. The document insert no longer sets `uploaded_by`.
- `lib/conversations.ts`: `createConversation`, `logTurn`, `deleteConversation` run through `asUser(userId, …)`.
- Unchanged (system writes, `by` = null): `worker/index.ts`, `lib/indexing.ts`. Their explicit `updated_at = now()` assignments remain and are harmless.

## 7. Testing

1. **Unit (vitest, `tests/migrations.test.ts`):** `parseFilename` accepts `V1__init.sql` / `V010__add_x.sql` and rejects `v1__x.sql`, `V1_x.sql`, `V1__x.txt`; `planMigrations` orders V2 before V10, returns only pending files, and throws on a duplicate version, a checksum mismatch, and a missing applied file.
2. **Dev database:** `npm run db:migrate` twice — first run: V1 applied, V2 applied; second: up to date.
3. **Throwaway trigger check (not committed, cleans up):** insert via `asUser` → `created_by` = that user, `updated_by` = same; system update → `updated_by` null, `created_*` unchanged, `updated_at` advanced; an update that sets `created_at` explicitly is overridden.
4. **Existing suite + typecheck + lint + build** stay green.
5. **Clean-database check (manual, user):** empty Supabase project → set `DATABASE_URL` → `npm run db:migrate` → app signup, upload, chat work.

## 8. Out of scope

- change-history log (old/new values, deletes)
- undo/repair/baseline commands
- a migration lock for concurrent deploys
- showing audit fields in the admin UI
