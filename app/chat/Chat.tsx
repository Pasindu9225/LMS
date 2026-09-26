'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { linkCitations } from '@/lib/text';
import { t, type Lang } from '@/lib/i18n';

type Subject = { id: string; name_si: string; name_en: string };
type Source = { n: number; documentId: string; title: string; unitSi: string | null; unitEn: string | null; page: number };
type Msg = { role: 'user' | 'bot'; text: string; sources: Source[] };

const pdfUrl = (s: Source) => `/api/pdf/${s.documentId}?page=${s.page}`;

// Remembered preferences: localStorage when available, in-memory otherwise (private mode).
const mem = new Map<string, string>();
const listeners = new Set<() => void>();
const load = (k: string) => { if (mem.has(k)) return mem.get(k)!; try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
function useStored(key: string): [string, (v: string) => void] {
  const value = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => load(key),
    () => '',
  );
  return [value, (v) => {
    mem.set(key, v);
    try { localStorage.setItem(key, v); } catch { /* private mode */ }
    listeners.forEach((l) => l());
  }];
}

export default function Chat({ subjects }: { subjects: Subject[] }) {
  const [storedLang, setLang] = useStored('lang');
  const [storedSubject, setSubjectId] = useStored('subject');
  const lang: Lang = storedLang === 'en' ? 'en' : 'si';
  const subjectId = subjects.some((s) => s.id === storedSubject) ? storedSubject : subjects[0]?.id ?? '';
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const L = t[lang];
  const subject = subjects.find((s) => s.id === subjectId);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' }); // returns a Promise in newer Chrome; must not be returned
  }, [msgs]);

  const inFlight = useRef(false);

  // Plain submit handler, not <form action>: React runs actions as transitions, which delays the
  // message-append below while streamed updates apply immediately (seen as an "undefined…" answer).
  async function ask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const question = String(new FormData(form).get('q') ?? '').trim();
    if (!question || !subjectId || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    form.reset();
    let botIndex = -1;
    setMsgs((ms) => {
      botIndex = ms.length + 1;
      return [...ms, { role: 'user', text: question, sources: [] }, { role: 'bot', text: '', sources: [] }];
    });
    const updateBot = (f: (m: Msg) => Msg) => setMsgs((ms) => ms.map((m, i) => (i === botIndex ? f(m) : m)));
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subjectId, question }),
      });
      if (!res.ok || !res.body) {
        updateBot((m) => ({ ...m, text: res.status === 429 ? L.limit : L.error }));
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === 'sources') updateBot((m) => ({ ...m, sources: ev.sources }));
          else if (ev.type === 'text') updateBot((m) => ({ ...m, text: m.text + ev.text }));
          else if (ev.type === 'error') updateBot((m) => ({ ...m, text: (m.text ? m.text + '\n\n' : '') + L.error }));
        }
      }
    } catch {
      updateBot((m) => ({ ...m, text: L.error }));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-dvh max-w-3xl flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b p-3">
        <h1 className="mr-auto font-semibold">{L.title}</h1>
        <select
          aria-label={L.subject} value={subjectId} className="rounded border p-1 text-sm"
          onChange={(e) => setSubjectId(e.target.value)}
        >
          {subjects.map((s) => <option key={s.id} value={s.id}>{lang === 'si' ? s.name_si : s.name_en}</option>)}
        </select>
        <button
          className="rounded border px-2 py-1 text-sm"
          onClick={() => setLang(lang === 'si' ? 'en' : 'si')}
        >{lang === 'si' ? 'English' : 'සිංහල'}</button>
        <form action="/auth/signout" method="post"><button className="text-sm text-gray-600">{L.logout}</button></form>
      </header>

      <main className="flex-1 space-y-4 overflow-y-auto p-3">
        {!subjects.length && <p className="text-gray-600">{L.noSubjects}</p>}
        {!msgs.length && subjects.length > 0 && <p className="text-gray-600">{L.empty}</p>}
        {msgs.map((m, i) => m.role === 'user' ? (
          <div key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg bg-blue-600 p-3 text-white">{m.text}</div>
        ) : (
          <div key={i} className="max-w-[95%] rounded-lg bg-gray-100 p-3">
            {m.text ? (
              <div className="md">
                <ReactMarkdown
                  remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}
                  components={{
                    a: ({ href, children }) => {
                      const n = href?.match(/^#src-(\d+)$/)?.[1];
                      const s = n ? m.sources[Number(n) - 1] : undefined;
                      return <a href={s ? pdfUrl(s) : href} target="_blank" rel="noreferrer">{children}</a>;
                    },
                  }}
                >{linkCitations(m.text, m.sources.length)}</ReactMarkdown>
              </div>
            ) : <p className="text-gray-500">{L.thinking}</p>}
            {m.sources.length > 0 && (
              <div className="mt-3 border-t pt-2">
                <p className="mb-1 text-xs font-semibold text-gray-600">{L.sources}</p>
                <ol className="space-y-1 text-xs">
                  {m.sources.map((s) => (
                    <li key={s.n}>
                      <a href={pdfUrl(s)} target="_blank" rel="noreferrer" className="text-blue-600">
                        [{s.n}] {lang === 'si' ? subject?.name_si : subject?.name_en}
                        {' → '}{(lang === 'si' ? s.unitSi : s.unitEn) ?? s.unitSi ?? s.unitEn ?? '—'}
                        {' → '}{s.title}, {L.page} {s.page}
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </main>

      <form onSubmit={ask} className="flex gap-2 border-t p-3">
        <textarea
          name="q" required maxLength={1000} rows={2} placeholder={L.placeholder}
          className="flex-1 resize-none rounded border p-2"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
        />
        <button disabled={busy || !subjectId} className="rounded bg-blue-600 px-4 text-white disabled:opacity-50">{L.send}</button>
      </form>
    </div>
  );
}
