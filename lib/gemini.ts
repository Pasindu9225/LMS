import dns from 'node:dns';
import { GoogleGenAI, Type } from '@google/genai';
import { OCR_PROMPT, REWRITE_PROMPT } from '@/lib/prompts';
import { historyBlock, type Turn } from '@/lib/text';

// Some Sri Lankan ISPs advertise broken IPv6 routes; Google calls then time out after 10 s.
dns.setDefaultResultOrder('ipv4first');

let client: GoogleGenAI | undefined;
const ai = () => (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

const model = (name: 'GEMINI_OCR_MODEL' | 'GEMINI_CHAT_MODEL' | 'GEMINI_EMBED_MODEL') => {
  const m = process.env[name];
  if (!m) throw new Error(`${name} is not set`);
  return m;
};

export const EMBED_DIMS = 768;

/** Retries 429, 5xx and network errors (no status) with exponential backoff. */
// Default waits 4 s, 8 s, 16 s: Gemini "high demand" 503s often last longer than a few seconds.
export async function withRetry<T>(fn: () => Promise<T>, retries = 3, baseMs = 4000): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const status = (e as { status?: number }).status;
      const retryable = status === undefined || status === 429 || status >= 500;
      if (!retryable || attempt >= retries) throw e;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** attempt));
    }
  }
}

export async function ocrPage(pdfPage: Uint8Array): Promise<string> {
  const ocrModel = model('GEMINI_OCR_MODEL'); // outside withRetry: config errors must not be retried
  const res = await withRetry(() =>
    ai().models.generateContent({
      model: ocrModel,
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: Buffer.from(pdfPage).toString('base64') } },
          { text: OCR_PROMPT },
        ],
      }],
    }),
  );
  return (res.text ?? '').trim();
}

export async function embed(
  texts: string[],
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY',
): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const embedModel = model('GEMINI_EMBED_MODEL');
    const res = await withRetry(() =>
      ai().models.embedContent({
        model: embedModel,
        contents: texts.slice(i, i + 100),
        config: { taskType, outputDimensionality: EMBED_DIMS },
      }),
    );
    out.push(...res.embeddings!.map((e) => e.values!));
  }
  return out;
}

/** Rewrite input: earlier turns (if any) only help resolve references like "it" or "that". */
export const rewriteContents = (q: string, history: Turn[] = []) =>
  history.length ? `${historyBlock(history)}

Question: ${q}` : q;

/** Answer input: past turns as real chat turns, then the message holding this turn's sources. */
export const answerContents = (user: string, history: Turn[] = []) => [
  ...history.flatMap((t) => [
    { role: 'user' as const, parts: [{ text: t.question }] },
    { role: 'model' as const, parts: [{ text: t.answer }] },
  ]),
  { role: 'user' as const, parts: [{ text: user }] },
];

export async function rewriteQuestion(
  q: string,
  history: Turn[] = [],
): Promise<{ query_si: string; query_en: string; reply_lang: 'si' | 'en' }> {
  const chatModel = model('GEMINI_CHAT_MODEL');
  const res = await withRetry(() =>
    ai().models.generateContent({
      model: chatModel,
      contents: rewriteContents(q, history),
      config: {
        systemInstruction: REWRITE_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            query_si: { type: Type.STRING },
            query_en: { type: Type.STRING },
            reply_lang: { type: Type.STRING, enum: ['si', 'en'] },
          },
          required: ['query_si', 'query_en', 'reply_lang'],
        },
      },
    }),
  );
  return JSON.parse(res.text ?? '{}');
}

/** Streams answer text. The single place to change if the chat provider changes. */
export async function* generateAnswer(system: string, user: string, history: Turn[] = []): AsyncGenerator<string> {
  const stream = await ai().models.generateContentStream({
    model: model('GEMINI_CHAT_MODEL'),
    contents: answerContents(user, history),
    config: { systemInstruction: system },
  });
  for await (const chunk of stream) if (chunk.text) yield chunk.text;
}
