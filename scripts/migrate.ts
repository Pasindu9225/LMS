import { readFile } from 'node:fs/promises';
import { sql } from '@/lib/db';

async function main() {
  await sql.unsafe(await readFile('db/schema.sql', 'utf8'));
  console.log('schema applied');
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
