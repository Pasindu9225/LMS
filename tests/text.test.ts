import { describe, it, expect } from 'vitest';
import { chunkPage, mergeResults, linkCitations, stripCitations, buildHistory, historyBlock, titleFrom, colomboDate } from '@/lib/text';

const squash = (s: string) => s.replace(/\s+/g, '');

describe('chunkPage', () => {
  it('returns [] for blank pages', () => {
    expect(chunkPage('')).toEqual([]);
    expect(chunkPage('  \n\n \n')).toEqual([]);
  });

  it('keeps a short page as one chunk', () => {
    const page = 'මවුලය යනු ප්‍රමාණයේ ඒකකයයි.\n\nදෙවන ඡේදය.';
    expect(chunkPage(page)).toEqual([page]);
  });

  it('groups paragraphs without exceeding 1500 chars or losing text', () => {
    const para = 'අ'.repeat(500);
    const page = Array(5).fill(para).join('\n\n');
    const chunks = chunkPage(page);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 1500)).toBe(true);
    expect(chunks.join('\n\n')).toBe(page);
  });

  it('splits a long paragraph at sentence ends', () => {
    const page = 'මෙය වාක්‍යයකි. '.repeat(200).trim();
    const chunks = chunkPage(page);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 1500 && c.endsWith('.'))).toBe(true);
    expect(squash(chunks.join(''))).toBe(squash(page));
  });

  it('hard-cuts run-on text that has no breaks or punctuation', () => {
    const page = 'ක'.repeat(4000);
    const chunks = chunkPage(page);
    expect(chunks.every((c) => c.length <= 1500)).toBe(true);
    expect(chunks.join('')).toBe(page);
  });

  it('folds a short trailing piece (e.g. the page number) into the previous chunk', () => {
    const page = `${'අ'.repeat(1300)}\n\n5`;
    expect(chunkPage(page)).toEqual([page]);
  });
});

describe('mergeResults', () => {
  it('dedupes by id keeping the best score, sorts, and limits', () => {
    const a = [{ id: 'x', similarity: 0.5 }, { id: 'y', similarity: 0.9 }];
    const b = [{ id: 'x', similarity: 0.8 }, { id: 'z', similarity: 0.1 }];
    expect(mergeResults([a, b], 2)).toEqual([{ id: 'y', similarity: 0.9 }, { id: 'x', similarity: 0.8 }]);
  });

  it('handles no results', () => {
    expect(mergeResults([[], []], 8)).toEqual([]);
  });
});

describe('linkCitations', () => {
  it('links valid citations', () => {
    expect(linkCitations('A [1] B [2]', 2)).toBe('A [[1]](#src-1) B [[2]](#src-2)');
  });
  it('leaves out-of-range numbers as plain text', () => {
    expect(linkCitations('X [9] [0]', 8)).toBe('X [9] [0]');
  });
  it('splits grouped citations', () => {
    expect(linkCitations('Y [1, 2]', 3)).toBe('Y [[1]](#src-1)[[2]](#src-2)');
  });
  it('does not touch existing markdown links', () => {
    expect(linkCitations('[1](http://a.lk)', 3)).toBe('[1](http://a.lk)');
  });
});

describe('stripCitations', () => {
  it('removes single and grouped citations with the space before them', () => {
    expect(stripCitations('Mole is a unit [1]. It is big [2][3] and [4, 5].')).toBe('Mole is a unit. It is big and.');
  });
  it('leaves numeric brackets inside math spans alone', () => {
    const s = 'x is in $[0, 1]$ and $$A = [1, 2]$$ [3].';
    expect(stripCitations(s)).toBe('x is in $[0, 1]$ and $$A = [1, 2]$$.');
  });
  it('keeps markdown links and LaTeX brackets', () => {
    const s = 'see [docs](http://a.lk) and $[a,b]$';
    expect(stripCitations(s)).toBe(s);
  });
});

describe('buildHistory', () => {
  it('keeps the last 4 turns oldest first, strips citations, caps answers at 1500', () => {
    const turns = Array.from({ length: 6 }, (_, i) => ({ question: `q${i}`, answer: `a${i} [1]` }));
    turns[5].answer = 'x'.repeat(2000);
    const h = buildHistory(turns);
    expect(h.map((t) => t.question)).toEqual(['q2', 'q3', 'q4', 'q5']);
    expect(h[0].answer).toBe('a2');
    expect(h[3].answer.length).toBe(1500);
  });
  it('handles no turns', () => {
    expect(buildHistory([])).toEqual([]);
  });
});

describe('historyBlock', () => {
  it('formats turns inside <history>', () => {
    expect(historyBlock([{ question: 'Q1', answer: 'A1' }, { question: 'Q2', answer: 'A2' }]))
      .toBe('<history>\nStudent: Q1\nTutor: A1\n\nStudent: Q2\nTutor: A2\n</history>');
  });
});

describe('titleFrom', () => {
  it('collapses whitespace', () => {
    expect(titleFrom('  mole\n\nkiyanne   mokakda ')).toBe('mole kiyanne mokakda');
  });
  it('cuts to 80 code points', () => {
    expect(Array.from(titleFrom('ම'.repeat(100))).length).toBe(80);
  });
});

describe('colomboDate', () => {
  it('uses Sri Lanka time (UTC+5:30)', () => {
    expect(colomboDate('2026-10-01T20:00:00.000Z')).toBe('2026-10-02');
    expect(colomboDate('2026-10-01T18:00:00.000Z')).toBe('2026-10-01');
  });
});
