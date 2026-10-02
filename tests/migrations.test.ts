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
