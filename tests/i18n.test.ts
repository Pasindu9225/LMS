import { describe, it, expect } from 'vitest';
import { dict, fmt } from '@/lib/i18n';

const keys = (o: object, prefix = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`])).sort();
const values = (o: object): string[] => Object.values(o).flatMap((v) => (typeof v === 'object' ? values(v) : [v]));

describe('i18n dictionaries', () => {
  it('Sinhala and English have exactly the same keys', () => {
    expect(keys(dict.en)).toEqual(keys(dict.si));
  });
  it('has no empty strings', () => {
    expect([...values(dict.si), ...values(dict.en)].filter((s) => !String(s).trim())).toEqual([]);
  });
  it('uses the same placeholders in both languages', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    const flat = (o: object, p = ''): [string, string][] =>
      Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v as string]]));
    const en = new Map(flat(dict.en));
    for (const [k, v] of flat(dict.si)) expect(ph(en.get(k)!), k).toBe(ph(v));
  });
});

describe('fmt', () => {
  it('fills placeholders and leaves unknown ones', () => {
    expect(fmt('{done}/{total} done {x}', { done: 1, total: 3 })).toBe('1/3 done {x}');
  });
});
