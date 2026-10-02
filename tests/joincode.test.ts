import { describe, it, expect } from 'vitest';
import { newJoinCode, normalizeCode, formatCode } from '@/lib/joincode';

describe('newJoinCode', () => {
  it('is 8 characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 500; i++) {
      const c = newJoinCode();
      expect(c).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    }
  });
  it('varies', () => {
    expect(new Set(Array.from({ length: 50 }, newJoinCode)).size).toBeGreaterThan(45);
  });
});

describe('normalizeCode', () => {
  it('ignores case, spaces and dashes', () => {
    expect(normalizeCode(' k7qm-2xpa ')).toBe('K7QM2XPA');
    expect(normalizeCode('K7QM 2XPA')).toBe('K7QM2XPA');
  });
  it('rejects wrong length or look-alike characters', () => {
    expect(normalizeCode('K7QM2XP')).toBeNull();
    expect(normalizeCode('K7QM2XPAB')).toBeNull();
    expect(normalizeCode('O7QM2XPA')).toBeNull();
    expect(normalizeCode('K1QM2XPA')).toBeNull();
    expect(normalizeCode('')).toBeNull();
  });
});

describe('formatCode', () => {
  it('shows XXXX-XXXX', () => {
    expect(formatCode('K7QM2XPA')).toBe('K7QM-2XPA');
  });
});
