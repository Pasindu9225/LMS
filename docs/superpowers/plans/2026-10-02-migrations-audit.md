# Versioned Migrations + Audit Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build any database (dev or a clean production one) from Flyway-style versioned migration files, and stamp `created_at/created_by/updated_at/updated_by` on every row of every table.

**Architecture:** `lib/migrations.ts` holds the pure ordering and checksum logic, and `scripts/migrate.ts` applies pending `db/migrations/V###__*.sql` files, each in a transaction with a `schema_history` row. `V001` is today's schema moved over unchanged. `V002` adds the audit columns and one `audit_stamp()` trigger on all tables, which reads the acting user from the transaction-local setting `app.user_id`. `asUser()` in `lib/db.ts` sets that setting for app writes.

**Tech Stack:** Node + tsx, `postgres` (porsager, `prepare:false`, Supabase transaction pooler), PostgreSQL 15+ (Supabase), vitest.

**Spec:** `docs/superpowers/specs/2026-10-02-migrations-audit-design.md`

## Global Constraints

- Migration filenames: `V<int>__<description>.sql`; description is letters, digits and underscores. Files live in `db/migrations/`.
- An applied migration file is never edited; changes go in a new V file.
- The audited tables are exactly: `profiles, subjects, units, documents, pages, chunks, chat_logs, conversations`.
- Audit columns: `created_at timestamptz not null default now()`, `created_by uuid references profiles on delete set null`, `updated_at timestamptz not null default now()`, `updated_by uuid references profiles on delete set null`.
- `set_config('app.user_id', …, true)` — always transaction-local (`true`), never session-level (pooler safety).
- Writes from the worker and indexing are system writes: `created_by` / `updated_by` stay null.
- No new dependencies. The command stays `npm run db:migrate`.

## Review Focus

1. **Line endings:** this repo checks out with CRLF on Windows (git warns "LF will be replaced by CRLF"). Production may deploy from Linux with LF. The same file must give the same checksum, or production refuses to migrate. Expected: the checksum ignores `\r\n` vs `\n` (Task 1 test).
2. **Branch merges:** a pending migration whose version is lower than one already applied (two branches each added a migration) must stop with a clear error, not silently run out of order (Task 1 test).
3. **A user id leaking across pooled connections:** after an `asUser` transaction, a later plain write on the same connection must record `by = null`, not the previous user (Task 3 throwaway check, step "system update after asUser").
4. **Attempts to rewrite history:** an `update … set created_at = …` or `created_by = …` must not change those columns (Task 3 throwaway check).
5. **Signup on a fresh database:** a new auth user's profile must be created with `created_by` = its own id. The profile references itself, so a broken foreign key would block every signup (Task 3 throwaway check via `handle_new_user`).

---

### Task 1: Migration planning logic

**Files:**
- Create: `lib/migrations.ts`
- Test: `tests/migrations.test.ts`

**Interfaces:**
- Produces (from `@/lib/migrations`):
  - `type MigrationFile = { version: number; description: string; filename: string; sql: string; checksum: string }`
  - `type Applied = { version: number; checksum: string }`
  - `parseFilename(name: string): { version: number; description: string } | null`
  - `checksum(sql: string): string` — sha256 hex of the text with `\r\n` normalized to `\n`
  - `toMigration(filename: string, sql: string): MigrationFile` — throws on a bad filename
  - `planMigrations(files: MigrationFile[], applied: Applied[]): MigrationFile[]` — pending files ascending; throws on duplicate version, checksum mismatch, missing applied file, or a pending version lower than the highest applied

- [ ] **Step 1: Write the failing tests** — create `tests/migrations.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseFilename, checksum, toMigration, planMigrations } from '@/lib/migrations';

const m = (version: number, sql = `-- v${version}`) => toMigration(`V${version}__step_${version}.sql`, sql);
const applied = (...ms: ReturnType<typeof m>[]) => ms.map((x) => ({ version: x.version, checksum: x.checksum }));

describe('parseFilename', () => {
  it('accepts Flyway-style names', () => {
    expect(parseFilename('V1__init.sql')).toEqual({ version: 1, description: 'init' });
    expect(parseFilename('V010__add_x2.sql')).toEqual({ version: 10, description: 'add_x2' });
  });
  it('rejects anything else', () => {
    for (const bad of ['v1__x.sql', 'V1_x.sql', 'V1__x.txt', 'V__x.sql', 'V1__.sql', 'V1__a-b.sql', 'README.md']) {
      expect(parseFilename(bad)).toBeNull();
    }
  });
});

describe('checksum', () => {
  it('is the same for CRLF and LF line endings', () => {
    expect(checksum('a;\r\nb;\r\n')).toBe(checksum('a;\nb;\n'));
  });
  it('changes when the content changes', () => {
    expect(checksum('a;')).not.toBe(checksum('b;'));
  });
});

describe('toMigration', () => {
  it('throws on a bad filename, naming it', () => {
    expect(() => toMigration('V1_x.sql', '')).toThrow('V1_x.sql');
  });
});

describe('planMigrations', () => {
  it('orders by number, not text (V2 before V10)', () => {
    expect(planMigrations([m(10), m(2), m(1)], []).map((x) => x.version)).toEqual([1, 2, 10]);
  });
  it('returns only pending files', () => {
    const [a, b, c] = [m(1), m(2), m(3)];
    expect(planMigrations([a, b, c], applied(a, b)).map((x) => x.version)).toEqual([3]);
  });
  it('returns nothing when up to date', () => {
    const a = m(1);
    expect(planMigrations([a], applied(a))).toEqual([]);
  });
  it('throws on a duplicate version', () => {
    expect(() => planMigrations([m(1), toMigration('V1__other.sql', '')], [])).toThrow('Duplicate migration version V1');
  });
  it('throws when an applied file was edited', () => {
    const a = m(1);
    expect(() => planMigrations([m(1, '-- changed')], applied(a))).toThrow('V1 was edited after it was applied');
  });
  it('throws when an applied file is missing', () => {
    expect(() => planMigrations([m(2)], applied(m(1), m(2)))).toThrow('V1 is applied but its file is missing');
  });
  it('throws when a pending version is older than an applied one', () => {
    const [a, c] = [m(1), m(3)];
    expect(() => planMigrations([a, m(2), c], applied(a, c))).toThrow('V2 is older than applied V3');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/migrations.test.ts`
Expected: FAIL — cannot resolve `@/lib/migrations`.

- [ ] **Step 3: Implement** — create `lib/migrations.ts`:

```ts
import { createHash } from 'node:crypto';

export type MigrationFile = { version: number; description: string; filename: string; sql: string; checksum: string };
export type Applied = { version: number; checksum: string };

const NAME = /^V(\d+)__([A-Za-z0-9_]+)\.sql$/;

export function parseFilename(name: string): { version: number; description: string } | null {
  const m = NAME.exec(name);
  return m ? { version: Number(m[1]), description: m[2] } : null;
}

/** sha256 of the file text; CRLF and LF checkouts of the same file give the same checksum. */
export const checksum = (sql: string) => createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');

export function toMigration(filename: string, sql: string): MigrationFile {
  const p = parseFilename(filename);
  if (!p) throw new Error(`Bad migration filename "${filename}": expected V<number>__<description>.sql`);
  return { ...p, filename, sql, checksum: checksum(sql) };
}

/** Pending migrations in version order. Throws when the files and the history disagree. */
export function planMigrations(files: MigrationFile[], applied: Applied[]): MigrationFile[] {
  const byVersion = new Map<number, MigrationFile>();
  for (const f of files) {
    const dup = byVersion.get(f.version);
    if (dup) throw new Error(`Duplicate migration version V${f.version}: ${dup.filename}, ${f.filename}`);
    byVersion.set(f.version, f);
  }
  for (const a of applied) {
    const f = byVersion.get(a.version);
    if (!f) throw new Error(`V${a.version} is applied but its file is missing`);
    if (f.checksum !== a.checksum) throw new Error(`V${a.version} was edited after it was applied; add a new migration instead`);
  }
  const done = new Set(applied.map((a) => a.version));
  const maxApplied = Math.max(0, ...done);
  const pending = files.filter((f) => !done.has(f.version)).sort((a, b) => a.version - b.version);
  const stale = pending.find((f) => f.version < maxApplied);
  if (stale) throw new Error(`V${stale.version} is older than applied V${maxApplied}; renumber it above V${maxApplied}`);
  return pending;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/migrations.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/migrations.ts tests/migrations.test.ts
git commit -m "feat: Flyway-style migration planning with checksums"
```

---

### Task 2: Runner and baseline migration

**Files:**
- Move: `db/schema.sql` → `db/migrations/V001__baseline.sql` (`git mv`, content unchanged)
- Modify: `scripts/migrate.ts` (full replacement)
- Modify: `README.md` (setup step 4)

**Interfaces:**
- Consumes: `toMigration`, `planMigrations`, `Applied` (Task 1).
- Produces: `npm run db:migrate` applies pending files and maintains `schema_history(version, description, checksum, installed_at, execution_ms)`.

- [ ] **Step 1: Move the schema**

```bash
mkdir -p db/migrations && git mv db/schema.sql db/migrations/V001__baseline.sql
```

- [ ] **Step 2: Replace `scripts/migrate.ts`**

```ts
import { readdir, readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { toMigration, planMigrations, type Applied } from '@/lib/migrations';

const DIR = 'db/migrations';
// Own client: prepare:false for the Supabase pooler; notices ("already exists, skipping") silenced.
// ponytail: no lock — run migrations from one deploy at a time; add pg_advisory_xact_lock if that changes.
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, onnotice: () => {} });

async function main() {
  await sql`
    create table if not exists schema_history (
      version int primary key,
      description text not null,
      checksum text not null,
      installed_at timestamptz not null default now(),
      execution_ms int not null
    )`;
  const names = (await readdir(DIR)).sort();
  const files = await Promise.all(names.map(async (n) => toMigration(n, await readFile(`${DIR}/${n}`, 'utf8'))));
  const applied = await sql<Applied[]>`select version, checksum from schema_history`;
  const pending = planMigrations(files, [...applied]);
  if (!pending.length) console.log('up to date');

  for (const m of pending) {
    const t0 = Date.now();
    // The file and its history row commit together; a failing file rolls back completely.
    await sql.begin(async (tx) => {
      await tx.unsafe(m.sql);
      await tx`
        insert into schema_history (version, description, checksum, execution_ms)
        values (${m.version}, ${m.description}, ${m.checksum}, ${Date.now() - t0})`;
    });
    console.log(`V${m.version} ${m.description} … applied (${Date.now() - t0} ms)`);
  }
  await sql.end();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await sql.end();
  process.exit(1);
});
```

- [ ] **Step 3: Update `README.md` setup step 4** — replace the line ``4. `npm run db:migrate` (safe to re-run).`` with:

```markdown
4. `npm run db:migrate` — applies pending files from `db/migrations/` (Flyway-style `V###__name.sql`) and records them in `schema_history`. Safe to re-run. Never edit an applied migration; add a new `V` file.
```

- [ ] **Step 4: Run against the dev database twice**

Run: `npm run db:migrate && npm run db:migrate`
Expected: first run prints `V1 baseline … applied (… ms)`; second run prints `up to date`. No NOTICE objects printed.

- [ ] **Step 5: Tests, typecheck, lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add db scripts/migrate.ts README.md
git commit -m "feat: versioned migration runner with V001 baseline"
```

---

### Task 3: V002 audit columns and trigger

**Files:**
- Create: `db/migrations/V002__audit_columns.sql`
- Modify: `app/admin/actions.ts:83-85` (document insert stops setting `uploaded_by`)

**Interfaces:**
- Produces: on every audited table, `before insert or update` trigger `audit_stamp` that reads `current_setting('app.user_id', true)`. `documents.uploaded_by` no longer exists; use `documents.created_by`.

- [ ] **Step 1: Create `db/migrations/V002__audit_columns.sql`**

```sql
-- Audit columns on every table, stamped by one trigger.
-- The acting user comes from the transaction-local setting app.user_id (see asUser in lib/db.ts);
-- unset means a system write (worker, indexing) and records null.

create or replace function public.audit_stamp() returns trigger
language plpgsql set search_path = '' as $$
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

do $$
declare t text;
begin
  foreach t in array array['profiles', 'subjects', 'units', 'documents', 'pages', 'chunks', 'chat_logs', 'conversations'] loop
    execute format('alter table public.%I
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists created_by uuid references public.profiles on delete set null,
      add column if not exists updated_at timestamptz not null default now(),
      add column if not exists updated_by uuid references public.profiles on delete set null', t);
  end loop;
end $$;

-- One place for "who uploaded it". Runs before the triggers exist, so it is not stamped.
update public.documents set created_by = uploaded_by, updated_by = uploaded_by where uploaded_by is not null;
alter table public.documents drop column uploaded_by;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'subjects', 'units', 'documents', 'pages', 'chunks', 'chat_logs', 'conversations'] loop
    execute format('create or replace trigger audit_stamp before insert or update on public.%I
      for each row execute function public.audit_stamp()', t);
  end loop;
end $$;

-- A new user signed themselves up.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, created_by)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''), new.id);
  return new;
end $$;
```

- [ ] **Step 2: Stop writing `uploaded_by`** — in `app/admin/actions.ts`, `createDocument`, replace:

```ts
  await sql`
    insert into documents (subject_id, title, doc_type, year, storage_path, uploaded_by)
    values (${input.subjectId}, ${title}, ${input.docType}, ${year}, ${input.path}, ${admin.id})`;
```

with (Task 4 wraps it in `asUser`, which records the admin as `created_by`):

```ts
  await sql`
    insert into documents (subject_id, title, doc_type, year, storage_path)
    values (${input.subjectId}, ${title}, ${input.docType}, ${year}, ${input.path})`;
```

Keep `const admin = await requireAdmin();` as it is; Task 4 uses `admin.id`. If lint flags `admin` as unused at this step, that is expected and is resolved in Task 4. Do not change it to `await requireAdmin()`.

- [ ] **Step 3: Apply**

Run: `npm run db:migrate`
Expected: `V2 audit_columns … applied (… ms)`.

- [ ] **Step 4: Throwaway trigger check** (not committed). Create `scripts/.tmp/audit-check.ts`:

```ts
import assert from 'node:assert';
import { sql } from '@/lib/db';

async function main() {
  const [u] = await sql<{ id: string }[]>`select id from profiles limit 1`;
  let id = '';
  try {
    // Insert as a user (what asUser will do).
    id = await sql.begin(async (tx) => {
      await tx`select set_config('app.user_id', ${u.id}, true)`;
      const [s] = await tx<{ id: string }[]>`insert into subjects (name_si, name_en) values ('audit-check', 'audit-check') returning id`;
      return s.id;
    });
    const [a] = await sql`select created_by, updated_by, created_at, updated_at from subjects where id = ${id}`;
    assert.equal(a.created_by, u.id, 'created_by = acting user');
    assert.equal(a.updated_by, u.id, 'updated_by = acting user on insert');

    // System update after asUser: nothing leaks from the previous transaction.
    await sql`update subjects set name_en = 'audit-check-2' where id = ${id}`;
    const [b] = await sql`select created_by, updated_by, created_at, updated_at from subjects where id = ${id}`;
    assert.equal(b.updated_by, null, 'system update records null');
    assert.equal(b.created_by, u.id, 'created_by unchanged');
    assert.equal(+b.created_at, +a.created_at, 'created_at unchanged');
    assert.ok(+b.updated_at >= +a.updated_at, 'updated_at advanced');

    // Attempts to rewrite history are ignored.
    await sql`update subjects set created_at = '2000-01-01', created_by = null where id = ${id}`;
    const [c] = await sql`select created_by, created_at from subjects where id = ${id}`;
    assert.equal(c.created_by, u.id);
    assert.equal(+c.created_at, +a.created_at);

    // Signup trigger: profile references itself.
    const [{ def }] = await sql`select pg_get_functiondef('public.handle_new_user'::regproc) as def`;
    assert.ok(String(def).includes('created_by'), 'handle_new_user sets created_by');
    const [p] = await sql`select count(*)::int n from profiles where created_by is null`;
    console.log('AUDIT OK', { profilesWithoutCreator: p.n });
  } finally {
    if (id) await sql`delete from subjects where id = ${id}`;
    await sql.end();
  }
}
main().catch((e) => { console.error('AUDIT FAIL:', e.message); process.exit(1); });
```

Run: `npx tsx --env-file-if-exists=.env.local scripts/.tmp/audit-check.ts; rm -rf scripts/.tmp`
Expected: `AUDIT OK …`. (`profilesWithoutCreator` is the count of pre-existing profiles; informational only.)

- [ ] **Step 5: Tests, typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/V002__audit_columns.sql app/admin/actions.ts
git commit -m "feat: audit columns and stamping trigger on every table"
```

---

### Task 4: Record the acting user on app writes

**Files:**
- Modify: `lib/db.ts` (add `asUser`)
- Modify: `app/admin/actions.ts` (every write)
- Modify: `lib/conversations.ts` (`createConversation`, `logTurn`, `deleteConversation`)

**Interfaces:**
- Consumes: the `audit_stamp` trigger and the `app.user_id` setting (Task 3).
- Produces: `asUser<T>(userId: string, fn: (tx: postgres.TransactionSql) => Promise<T>)` from `@/lib/db`.

- [ ] **Step 1: Add `asUser` to `lib/db.ts`** (append):

```ts
/**
 * Runs fn in a transaction tagged with the acting user; the audit trigger records them as
 * created_by/updated_by. Transaction-local (true), so the id never leaks to another pooled request.
 */
export const asUser = <T>(userId: string, fn: (tx: postgres.TransactionSql) => Promise<T>) =>
  sql.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId}, true)`;
    return fn(tx);
  });
```

- [ ] **Step 2: Wire `app/admin/actions.ts`** — change the import to `import { sql, isUuid, asUser } from '@/lib/db';` and apply these replacements. Each `await requireAdmin();` that a write needs becomes `const admin = await requireAdmin();`.

`saveSubject`:

```ts
export async function saveSubject(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd, 'id'), si = str(fd, 'name_si'), en = str(fd, 'name_en');
  need(si && en, 'Both names are required');
  if (id) need(isUuid(id), 'Bad id');
  await asUser(admin.id, (tx) => id
    ? tx`update subjects set name_si = ${si}, name_en = ${en} where id = ${id}`
    : tx`insert into subjects (name_si, name_en) values (${si}, ${en})`);
  revalidatePath('/admin/subjects');
}
```

`deleteSubject` — the deleted row has no audit trail, so it stays a plain delete (no change).

`saveUnit`:

```ts
export async function saveUnit(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd, 'id'), subjectId = str(fd, 'subject_id');
  const si = str(fd, 'name_si'), en = str(fd, 'name_en'), order = Number(str(fd, 'sort_order') || 0);
  need(si && en, 'Both names are required');
  need(Number.isInteger(order), 'Order must be a whole number');
  if (id) need(isUuid(id), 'Bad id');
  else need(isUuid(subjectId), 'Bad subject');
  await asUser(admin.id, (tx) => id
    ? tx`update units set name_si = ${si}, name_en = ${en}, sort_order = ${order} where id = ${id}`
    : tx`insert into units (subject_id, name_si, name_en, sort_order) values (${subjectId}, ${si}, ${en}, ${order})`);
  revalidatePath('/admin/subjects');
}
```

`deleteUnit`, `deleteDocument` — no change (deletes).

`createDocument` — replace the insert:

```ts
  await asUser(admin.id, (tx) => tx`
    insert into documents (subject_id, title, doc_type, year, storage_path)
    values (${input.subjectId}, ${title}, ${input.docType}, ${year}, ${input.path})`);
```

`setDocumentStatus`:

```ts
export async function setDocumentStatus(id: string, status: keyof typeof TRANSITIONS) {
  const admin = await requireAdmin();
  need(isUuid(id), 'Bad id');
  need(status in TRANSITIONS, 'Bad status');
  const r = await asUser(admin.id, (tx) => tx`
    update documents set status = ${status}, error = null
    where id = ${id} and status = any(${sql.array(TRANSITIONS[status])})`);
  need(r.count === 1, `Cannot change status to ${status} from the current status`);
  revalidatePath('/admin/documents');
  revalidatePath(`/admin/documents/${id}`);
}
```

`savePage`:

```ts
export async function savePage(documentId: string, pageNo: number, text: string) {
  const admin = await requireAdmin();
  pageArgs(documentId, pageNo);
  const r = await asUser(admin.id, (tx) => tx`
    update pages set text = ${text}, reviewed = true, ocr_failed = false
    where document_id = ${documentId} and page_no = ${pageNo}`);
  need(r.count === 1, 'Page not found');
  await indexPages(documentId, [pageNo]);
  revalidatePath(`/admin/documents/${documentId}`);
}
```

`retryOcr` — only the update is wrapped, never the Gemini call:

```ts
export async function retryOcr(documentId: string, pageNo: number) {
  const admin = await requireAdmin();
  pageArgs(documentId, pageNo);
  const { data, error } = await storage().download(pagePath(documentId, pageNo));
  if (error) throw error;
  const text = await ocrPage(new Uint8Array(await data.arrayBuffer()));
  await asUser(admin.id, (tx) => tx`
    update pages set text = ${text}, ocr_failed = false, reviewed = false
    where document_id = ${documentId} and page_no = ${pageNo}`);
  await indexPages(documentId, [pageNo]);
  revalidatePath(`/admin/documents/${documentId}`);
}
```

`setUnitRange` — change `await requireAdmin();` to `const admin = await requireAdmin();` and replace the update:

```ts
  const rows = await asUser(admin.id, (tx) => tx<{ page_no: number }[]>`
    update pages set unit_id = ${unitId}
    where document_id = ${documentId} and page_no between ${from} and ${to} returning page_no`);
```

- [ ] **Step 3: Wire `lib/conversations.ts`** — change the import to `import { sql, asUser } from '@/lib/db';` and replace three functions:

```ts
export async function createConversation(userId: string, title: string): Promise<string> {
  const [row] = await asUser(userId, (tx) => tx<{ id: string }[]>`
    insert into conversations (user_id, title) values (${userId}, ${title}) returning id`);
  return row.id;
}
```

```ts
/**
 * Logs one turn and bumps the conversation in a single statement (the CTE always runs).
 * The subselect logs with conversation_id null if the chat was deleted mid-stream, so the
 * turn still counts toward the daily limit instead of failing on the foreign key.
 */
export function logTurn(t: {
  userId: string; subjectId: string; conversationId: string; question: string; answer: string; chunkIds: string[];
}) {
  return asUser(t.userId, (tx) => tx`
    with bump as (update conversations set updated_at = now() where id = ${t.conversationId})
    insert into chat_logs (user_id, subject_id, conversation_id, question, answer, chunk_ids)
    values (${t.userId}, ${t.subjectId}, (select id from conversations where id = ${t.conversationId}), ${t.question}, ${t.answer}, ${sql.array(t.chunkIds)}::uuid[])`);
}
```

```ts
export async function deleteConversation(userId: string, id: string) {
  await asUser(userId, (tx) => tx`delete from conversations where id = ${id} and user_id = ${userId}`);
}
```

(`deleteConversation` goes through `asUser` because the delete's `on delete set null` updates `chat_logs.conversation_id`, and the trigger records the student as that update's `updated_by`.)

- [ ] **Step 4: Typecheck, lint, tests, build**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all pass. If `tsc` rejects `tx<...>` generics on `TransactionSql`, use `tx` without the generic and cast the result (`as unknown as { page_no: number }[]`), and record that.

- [ ] **Step 5: Throwaway end-to-end stamp check** (not committed). Create `scripts/.tmp/asuser-check.ts`:

```ts
import assert from 'node:assert';
import { sql } from '@/lib/db';
import { createConversation, logTurn, deleteConversation } from '@/lib/conversations';

async function main() {
  const [u] = await sql<{ id: string }[]>`select id from profiles limit 1`;
  const [s] = await sql<{ id: string }[]>`select id from subjects limit 1`;
  const id = await createConversation(u.id, 'asuser-check');
  try {
    const [c] = await sql`select created_by, updated_by from conversations where id = ${id}`;
    assert.equal(c.created_by, u.id);
    await logTurn({ userId: u.id, subjectId: s.id, conversationId: id, question: 'asuser-check-q', answer: 'a', chunkIds: [] });
    const [l] = await sql`select created_by from chat_logs where question = 'asuser-check-q'`;
    assert.equal(l.created_by, u.id);
    await deleteConversation(u.id, id);
    const [after] = await sql`select conversation_id, updated_by from chat_logs where question = 'asuser-check-q'`;
    assert.equal(after.conversation_id, null);
    assert.equal(after.updated_by, u.id, 'set-null cascade stamped with the student');
    console.log('ASUSER OK');
  } finally {
    await sql`delete from chat_logs where question = 'asuser-check-q'`;
    await sql`delete from conversations where id = ${id}`;
    await sql.end();
  }
}
main().catch((e) => { console.error('ASUSER FAIL:', e.message); process.exit(1); });
```

Run: `npx tsx --env-file-if-exists=.env.local scripts/.tmp/asuser-check.ts; rm -rf scripts/.tmp`
Expected: `ASUSER OK`.

- [ ] **Step 6: Commit**

```bash
git add lib/db.ts app/admin/actions.ts lib/conversations.ts
git commit -m "feat: record the acting user on admin and chat writes"
```

---

### Task 5: Docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a section** at the end of `README.md`:

```markdown
### Migrations and audit columns

- Schema lives only in `db/migrations/V###__name.sql` (Flyway-style). `npm run db:migrate` applies pending files in order, each with its `schema_history` row in one transaction, and refuses to run if an applied file was edited (checksums ignore CRLF/LF).
- New production database: create an empty Supabase project, set `DATABASE_URL`, run `npm run db:migrate`.
- Every table has `created_at`, `created_by`, `updated_at`, `updated_by`, set by the `audit_stamp` trigger. App writes go through `asUser(userId, tx => …)` (`lib/db.ts`) so the trigger knows who acted; worker and indexing writes record `null` (system).
- Deletes are not recorded.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: migrations and audit columns"
```
