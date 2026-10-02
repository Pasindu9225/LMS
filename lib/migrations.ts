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
