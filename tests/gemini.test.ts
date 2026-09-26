import { describe, it, expect } from 'vitest';
import { withRetry, embed } from '@/lib/gemini';

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
