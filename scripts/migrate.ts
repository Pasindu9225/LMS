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
