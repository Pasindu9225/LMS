export type PaperDoc = { id: string; title: string; doc_type: string; year: number | null };
export type PaperYear = { year: number | null; papers: PaperDoc[]; schemes: PaperDoc[] };

/** Past papers and marking schemes side by side per year, newest first; unknown year last. */
export function groupPapers(docs: PaperDoc[]): PaperYear[] {
  const byYear = new Map<number | null, PaperYear>();
  for (const d of docs) {
    if (d.doc_type !== 'past_paper' && d.doc_type !== 'marking_scheme') continue;
    const g = byYear.get(d.year) ?? { year: d.year, papers: [], schemes: [] };
    (d.doc_type === 'past_paper' ? g.papers : g.schemes).push(d);
    byYear.set(d.year, g);
  }
  return [...byYear.values()].sort((a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity));
}
