import { getUser } from '@/lib/auth';
import { sql, isUuid } from '@/lib/db';
import { retrieve, buildUserMessage } from '@/lib/retrieval';
import { generateAnswer } from '@/lib/gemini';
import { answerSystemPrompt, NOT_FOUND, FALLBACK } from '@/lib/prompts';

export const maxDuration = 60;
const DAILY_LIMIT = 100;
const MIN_SIMILARITY = Number(process.env.MIN_SIMILARITY ?? 0.5);

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const body = await req.json().catch(() => ({}));
  const subjectId = body?.subjectId;
  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  if (!isUuid(subjectId) || !question || question.length > 1000) return new Response('Bad request', { status: 400 });

  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from chat_logs
    where user_id = ${user.id}
      and created_at >= (date_trunc('day', now() at time zone 'Asia/Colombo') at time zone 'Asia/Colombo')`;
  if (n >= DAILY_LIMIT) return new Response('Daily limit reached', { status: 429 });

  const log = (answer: string, chunkIds: string[]) => sql`
    insert into chat_logs (user_id, subject_id, question, answer, chunk_ids)
    values (${user.id}, ${subjectId}, ${question}, ${answer}, ${sql.array(chunkIds)}::uuid[])`;

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctl) {
      const send = (o: object) => ctl.enqueue(enc.encode(JSON.stringify(o) + '\n'));
      try {
        const { replyLang, hits } = await retrieve(subjectId, question);
        if ((hits[0]?.similarity ?? 0) < MIN_SIMILARITY) {
          send({ type: 'text', text: NOT_FOUND[replyLang] });
          await log(NOT_FOUND[replyLang], []);
          return;
        }
        send({
          type: 'sources',
          sources: hits.map((h, i) => ({
            n: i + 1, documentId: h.document_id, title: h.title, unitSi: h.unit_si, unitEn: h.unit_en, page: h.page_no,
          })),
        });

        let answer = '';
        for (let attempt = 0; ; attempt++) {
          try {
            for await (const t of generateAnswer(answerSystemPrompt(replyLang), buildUserMessage(hits, question))) {
              answer += t;
              send({ type: 'text', text: t });
            }
            break;
          } catch (e) {
            if (answer || attempt > 0) throw e; // retry once, only if nothing was streamed yet
          }
        }
        if (!answer.trim()) {
          answer = FALLBACK[replyLang];
          send({ type: 'text', text: answer });
        }
        await log(answer, hits.map((h) => h.id));
      } catch (e) {
        console.error('chat failed', e);
        send({ type: 'error' });
      } finally {
        ctl.close();
      }
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}
