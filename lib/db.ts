import postgres from 'postgres';

const g = globalThis as unknown as { sql?: postgres.Sql };
// prepare:false is required by Supabase's transaction pooler.
export const sql = (g.sql ??= postgres(process.env.DATABASE_URL!, { prepare: false }));

export const isUuid = (s: unknown): s is string =>
  typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export const toVector = (v: number[]) => `[${v.join(',')}]`;
