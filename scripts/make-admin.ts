import postgres from 'postgres';

// Bootstraps the first admin on a fresh database: npm run make-admin -- someone@example.com
// The person must have signed up first.
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error('Usage: npm run make-admin -- <email>');
  const [p] = await sql<{ id: string; role: string }[]>`
    select p.id, p.role from profiles p join auth.users u on u.id = p.id where lower(u.email) = ${email}`;
  if (!p) throw new Error(`No signed-up user with email ${email}`);
  if (p.role === 'admin') console.log(`${email} is already an admin`);
  else {
    await sql`update profiles set role = 'admin' where id = ${p.id}`;
    await sql`delete from teacher_subjects where teacher_id = ${p.id}`;
    console.log(`${email} is now an admin`);
  }
  await sql.end();
}

main().catch(async (e) => { console.error(e instanceof Error ? e.message : e); await sql.end(); process.exit(1); });
