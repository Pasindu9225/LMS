import postgres from 'postgres';

const g = globalThis as unknown as { sql?: postgres.Sql };
// prepare:false is required by Supabase's transaction pooler.
export const sql = (g.sql ??= postgres(process.env.DATABASE_URL!, { prepare: false }));

export const isUuid = (s: unknown): s is string =>
  typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export const toVector = (v: number[]) => `[${v.join(',')}]`;

/**
 * Runs fn in a transaction tagged with the acting user; the audit trigger records them as
 * created_by/updated_by. Transaction-local (true), so the id never leaks to another pooled request.
 */
export const asUser = <T>(userId: string, fn: (tx: postgres.TransactionSql) => Promise<T>) =>
  sql.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId}, true)`;
    return fn(tx);
  });
