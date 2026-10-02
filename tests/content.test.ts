import { describe, it, expect } from 'vitest';
import { parseYouTubeId } from '@/lib/youtube';
import { groupPapers } from '@/lib/papers';

describe('parseYouTubeId', () => {
  const id = 'dQw4w9WgXcQ';
  it('reads the common link formats', () => {
    for (const url of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?v=${id}&t=42s`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}`,
      `https://youtu.be/${id}?si=abc`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube-nocookie.com/embed/${id}`,
      `https://www.youtube.com/live/${id}`,
      `  https://youtu.be/${id}  `,
    ]) expect(parseYouTubeId(url), url).toBe(id);
  });
  it('rejects anything else', () => {
    for (const url of [
      '', 'not a url', `https://vimeo.com/${id}`, 'https://www.youtube.com/playlist?list=PL123',
      'https://youtu.be/short', `https://evil.com/watch?v=${id}`, `https://youtube.com.evil.com/watch?v=${id}`,
      `javascript:alert(1)//youtu.be/${id}`,
    ]) expect(parseYouTubeId(url), url).toBeNull();
  });
});

describe('groupPapers', () => {
  const d = (id: string, doc_type: string, year: number | null) => ({ id, title: id, doc_type, year });
  it('groups by year, newest first, unknown year last', () => {
    const g = groupPapers([d('p22', 'past_paper', 2022), d('s23', 'marking_scheme', 2023), d('p23a', 'past_paper', 2023),
      d('p23b', 'past_paper', 2023), d('px', 'past_paper', null)]);
    expect(g.map((x) => x.year)).toEqual([2023, 2022, null]);
    expect(g[0].papers.map((x) => x.id)).toEqual(['p23a', 'p23b']);
    expect(g[0].schemes.map((x) => x.id)).toEqual(['s23']);
    expect(g[1].schemes).toEqual([]);
  });
  it('ignores other document types', () => {
    expect(groupPapers([d('t', 'textbook', 2023)])).toEqual([]);
  });
});
