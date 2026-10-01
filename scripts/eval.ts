import { readFile } from 'node:fs/promises';
import { sql } from '@/lib/db';
import { retrieve } from '@/lib/retrieval';
import { buildHistory, type Turn } from '@/lib/text';

type Q = { subjectId: string; question: string; history?: Turn[]; documentId?: string; page?: number; offSyllabus?: boolean };

async function main() {
  const file = process.argv[2] ?? 'eval/questions.json';
  const qs: Q[] = JSON.parse(await readFile(file, 'utf8'));
  const answerable: number[] = [];
  const off: number[] = [];
  let hits = 0;

  for (const q of qs) {
    const { hits: found } = await retrieve(q.subjectId, q.question, buildHistory(q.history ?? []));
    const best = found[0]?.similarity ?? 0;
    if (q.offSyllabus) {
      off.push(best);
      console.log(`OFF  ${best.toFixed(3)}  ${q.question}`);
      continue;
    }
    answerable.push(best);
    const hit = found.some((h) => h.document_id === q.documentId && h.page_no === q.page);
    if (hit) hits++;
    console.log(`${hit ? 'HIT ' : 'MISS'} ${best.toFixed(3)}  ${q.question}`);
  }

  console.log(`\nhit@8: ${hits}/${answerable.length}`);
  if (answerable.length && off.length) {
    const lo = Math.min(...answerable), hi = Math.max(...off);
    console.log(`lowest best-similarity (answerable): ${lo.toFixed(3)}`);
    console.log(`highest best-similarity (off-syllabus): ${hi.toFixed(3)}`);
    console.log(lo > hi
      ? `suggested MIN_SIMILARITY=${((lo + hi) / 2).toFixed(3)}`
      : 'ranges overlap: pick MIN_SIMILARITY just above the off-syllabus max and review the answerable questions below it');
  }
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
