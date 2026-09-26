import { GoogleGenAI } from '@google/genai';
import { OCR_PROMPT } from '@/lib/prompts';

let client: GoogleGenAI | undefined;
const ai = () => (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

const model = (name: 'GEMINI_OCR_MODEL' | 'GEMINI_CHAT_MODEL' | 'GEMINI_EMBED_MODEL') => {
  const m = process.env[name];
  if (!m) throw new Error(`${name} is not set`);
  return m;
};

export const EMBED_DIMS = 768;

/** Retries 429, 5xx and network errors (no status) with exponential backoff. */
export async function withRetry<T>(fn: () => Promise<T>, retries = 3, baseMs = 1000): Promise<T> {
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
