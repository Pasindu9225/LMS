import { describe, it, expect } from 'vitest';
import { validateQuestions, publicQuestions, gradeQuiz } from '@/lib/quiz';

const ids = ['c1', 'c2', 'c3'];
const q = (over: Record<string, unknown> = {}) => ({
  question: 'What is a mole?', options: ['A unit', 'A mass', 'A volume', 'A charge'],
  answer: 0, explanation: 'SI unit of amount.', source: 2, ...over,
});

describe('validateQuestions', () => {
  it('keeps a good question and maps its source to the chunk id', () => {
    expect(validateQuestions({ questions: [q()] }, ids)).toEqual([
      { question: 'What is a mole?', options: ['A unit', 'A mass', 'A volume', 'A charge'], answer: 0, explanation: 'SI unit of amount.', chunkId: 'c2' },
    ]);
  });
  it('drops malformed questions', () => {
    const bad = [
      q({ options: ['a', 'b', 'c'] }),
      q({ options: ['a', 'B ', 'b', 'c'] }),
      q({ options: ['a', '', 'c', 'd'] }),
      q({ answer: 4 }),
      q({ answer: 1.5 }),
      q({ source: 0 }),
      q({ source: 4 }),
      q({ question: '  ' }),
      q({ explanation: '' }),
      q({ options: 'abcd' }),
    ];
    expect(validateQuestions({ questions: bad }, ids)).toEqual([]);
  });
  it('caps at 5 and trims text', () => {
    const many = Array.from({ length: 7 }, (_, i) => q({ question: ` Q${i} ` }));
    const out = validateQuestions({ questions: many }, ids);
    expect(out.map((x) => x.question)).toEqual(['Q0', 'Q1', 'Q2', 'Q3', 'Q4']);
  });
  it('handles junk input', () => {
    expect(validateQuestions(null, ids)).toEqual([]);
    expect(validateQuestions({ questions: 'x' }, ids)).toEqual([]);
  });
});

describe('publicQuestions', () => {
  it('never includes the answer key', () => {
    const [p] = publicQuestions(validateQuestions({ questions: [q()] }, ids));
    expect(Object.keys(p).sort()).toEqual(['options', 'question']);
  });
});

describe('gradeQuiz', () => {
  const qs = validateQuestions({ questions: [q({ answer: 0 }), q({ answer: 2 }), q({ answer: 3 })] }, ids);
  it('scores answers', () => {
    expect(gradeQuiz(qs, [0, 1, 3])).toEqual({ score: 2, correct: [true, false, true] });
  });
  it('rejects missing or out-of-range answers', () => {
    expect(gradeQuiz(qs, [0, 1])).toBeNull();
    expect(gradeQuiz(qs, [0, 1, 4])).toBeNull();
    expect(gradeQuiz(qs, [0, 1, -1])).toBeNull();
    expect(gradeQuiz(qs, [0, 1, 1.5])).toBeNull();
  });
});
