import { describe, it, expect } from 'vitest';
import { withRetry, embed, rewriteContents, answerContents } from '@/lib/gemini';

const apiError = (status?: number) => Object.assign(new Error(`status ${status}`), { status });

describe('withRetry', () => {
  it('retries transient errors, then returns the result', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      if (++calls < 3) throw apiError(503);
      return 'ok';
    }, 3, 1);
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('gives up after 1 attempt + 3 retries', async () => {
    let calls = 0;
    await expect(withRetry(async () => { calls++; throw apiError(429); }, 3, 1)).rejects.toThrow();
    expect(calls).toBe(4);
  });

  it('does not retry client errors', async () => {
    let calls = 0;
    await expect(withRetry(async () => { calls++; throw apiError(400); }, 3, 1)).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it('retries network errors that have no status', async () => {
    let calls = 0;
    await withRetry(async () => { if (++calls < 2) throw new Error('fetch failed'); return 1; }, 3, 1);
    expect(calls).toBe(2);
  });
});

describe('embed', () => {
  it('returns [] for no texts without calling the API', async () => {
    expect(await embed([], 'RETRIEVAL_DOCUMENT')).toEqual([]);
  });
});

describe('rewriteContents', () => {
  it('is just the question without history', () => {
    expect(rewriteContents('What is a mole?')).toBe('What is a mole?');
  });
  it('puts the history block before the question', () => {
    expect(rewriteContents('its uses?', [{ question: 'What is a mole?', answer: 'A unit.' }]))
      .toBe('<history>\nStudent: What is a mole?\nTutor: A unit.\n</history>\n\nQuestion: its uses?');
  });
});

describe('answerContents', () => {
  it('sends only the user message without history', () => {
    expect(answerContents('U')).toEqual([{ role: 'user', parts: [{ text: 'U' }] }]);
  });
  it('sends past turns as alternating user/model turns before the user message', () => {
    expect(answerContents('U', [{ question: 'Q1', answer: 'A1' }])).toEqual([
      { role: 'user', parts: [{ text: 'Q1' }] },
      { role: 'model', parts: [{ text: 'A1' }] },
      { role: 'user', parts: [{ text: 'U' }] },
    ]);
  });
});
