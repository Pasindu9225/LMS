import { getUser } from '@/lib/auth';
import { sql, isUuid } from '@/lib/db';
import { retrieve, buildUserMessage } from '@/lib/retrieval';
import { generateAnswer } from '@/lib/gemini';
import { answerSystemPrompt, NOT_FOUND, FALLBACK } from '@/lib/prompts';
import { createConversation, ownsConversation, getHistory, logTurn, toSource } from '@/lib/conversations';
import { titleFrom } from '@/lib/text';

export const maxDuration = 60;
const DAILY_LIMIT = 100;
const MIN_SIMILARITY = Number(process.env.MIN_SIMILARITY ?? 0.5);

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const body = await req.json().catch(() => ({}));
  const subjectId = body?.subjectId;
  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  const givenConvId = body?.conversationId ?? null;
  if (!isUuid(subjectId) || !question || question.length > 1000) return new Response('Bad request', { status: 400 });
  if (givenConvId !== null && !isUuid(givenConvId)) return new Response('Bad request', { status: 400 });
  // Same 404 for "not yours" and "doesn't exist", before any Gemini call.
  if (givenConvId && !(await ownsConversation(user.id, givenConvId))) return new Response('Not found', { status: 404 });

  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from chat_logs
    where user_id = ${user.id}
      and created_at >= (date_trunc('day', now() at time zone 'Asia/Colombo') at time zone 'Asia/Colombo')`;
  if (n >= DAILY_LIMIT) return new Response('Daily limit reached', { status: 429 });

  const conversationId: string = givenConvId ?? (await createConversation(user.id, titleFrom(question)));
  const log = (answer: string, chunkIds: string[]) =>
    logTurn({ userId: user.id, subjectId, conversationId, question, answer, chunkIds });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctl) {
      const send = (o: object) => ctl.enqueue(enc.encode(JSON.stringify(o) + '\n'));
      try {
        if (!givenConvId) send({ type: 'conversation', id: conversationId });
        // A history load failure fails the request: never silently answer a follow-up without memory.
        const history = givenConvId ? await getHistory(conversationId) : [];
        const { replyLang, hits } = await retrieve(subjectId, question, history);
        if ((hits[0]?.similarity ?? 0) < MIN_SIMILARITY) {
          send({ type: 'text', text: NOT_FOUND[replyLang] });
          await log(NOT_FOUND[replyLang], []);
          return;
        }
        send({ type: 'sources', sources: hits.map((h, i) => toSource(i + 1, h)) });

        let answer = '';
        for (let attempt = 0; ; attempt++) {
          try {
            for await (const t of generateAnswer(answerSystemPrompt(replyLang), buildUserMessage(hits, question), history)) {
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
