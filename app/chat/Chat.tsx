'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { linkCitations, titleFrom, colomboDate, flagView, type FlagStatus } from '@/lib/text';
import { t, type Lang } from '@/lib/i18n';
import type { Source, StoredTurn, ConversationItem } from '@/lib/conversations';
import { deleteChat, flagChat, markSeen } from './actions';

type Subject = { id: string; name_si: string; name_en: string };
type Msg = {
  role: 'user' | 'bot'; text: string; sources: (Source | null)[]; subjectId: string | null;
  logId?: string; flagStatus?: FlagStatus | null; reply?: string | null; repliedAt?: string | null;
};

const pdfUrl = (s: Source) => `/api/pdf/${s.documentId}?page=${s.page}`;
const toMsgs = (turns: StoredTurn[]): Msg[] => turns.flatMap((x) => [
  { role: 'user' as const, text: x.question, sources: [], subjectId: x.subjectId },
  { role: 'bot' as const, text: x.answer, sources: x.sources, subjectId: x.subjectId, logId: x.id, flagStatus: x.flagStatus, reply: x.reply, repliedAt: x.repliedAt },
]);
// Full page load, not client navigation: after replaceState the router still holds the
// /chat tree, so a soft navigation to /chat would keep the old messages on screen.
// eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload is the point (see above)
const openNewChat = () => window.location.assign('/chat');

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

export default function Chat({ subjects, conversations, conversationId, initialTurns }: {
  subjects: Subject[]; conversations: ConversationItem[]; conversationId?: string; initialTurns: StoredTurn[];
}) {
  const [storedLang, setLang] = useStored('lang');
  const [storedSubject, setSubjectId] = useStored('subject');
  const lang: Lang = storedLang === 'en' ? 'en' : 'si';
  const subjectId = subjects.some((s) => s.id === storedSubject) ? storedSubject : subjects[0]?.id ?? '';
  const [convId, setConvId] = useState(conversationId);
  const [convs, setConvs] = useState(conversations);
  const [msgs, setMsgs] = useState(() => toMsgs(initialTurns));
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const L = t[lang];
  const subjectName = (id: string | null) => {
    const s = subjects.find((x) => x.id === id);
    return s ? (lang === 'si' ? s.name_si : s.name_en) : '—';
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' }); // returns a Promise in newer Chrome; must not be returned
  }, [msgs]);

  const inFlight = useRef(false);

  // Mount only: these are the replies this screen shows. A later router.refresh() brings new
  // props that useState ignores, so marking from props there would hide replies never displayed.
  useEffect(() => {
    const ids = initialTurns.filter((x) => x.flagStatus === 'answered').map((x) => x.id);
    if (ids.length) markSeen(ids).catch(() => { /* the dot simply stays until next time */ });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Move a conversation to the top of the sidebar, adding it if new.
  const touch = (id: string, title: string) => setConvs((cs) => [
    { id, title: cs.find((c) => c.id === id)?.title ?? title, updatedAt: new Date().toISOString(), hasNewReply: false },
    ...cs.filter((c) => c.id !== id),
  ]);

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
    const askConv = convId;
    const askSubject = subjectId;
    if (askConv) touch(askConv, '');
    let botIndex = -1;
    setMsgs((ms) => {
      botIndex = ms.length + 1;
      return [...ms, { role: 'user', text: question, sources: [], subjectId: askSubject }, { role: 'bot', text: '', sources: [], subjectId: askSubject }];
    });
    const updateBot = (f: (m: Msg) => Msg) => setMsgs((ms) => ms.map((m, i) => (i === botIndex ? f(m) : m)));
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId: askSubject, question, conversationId: askConv }),
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
          if (ev.type === 'conversation') {
            setConvId(ev.id);
            touch(ev.id, titleFrom(question));
            window.history.replaceState(null, '', `/chat/${ev.id}`); // no remount mid-stream
          } else if (ev.type === 'sources') updateBot((m) => ({ ...m, sources: ev.sources }));
          else if (ev.type === 'text') updateBot((m) => ({ ...m, text: m.text + ev.text }));
          else if (ev.type === 'logged') updateBot((m) => ({ ...m, logId: ev.id }));
          else if (ev.type === 'error') updateBot((m) => ({ ...m, text: (m.text ? m.text + '\n\n' : '') + L.error }));
        }
      }
    } catch {
      updateBot((m) => ({ ...m, text: L.error }));
    } finally {
      inFlight.current = false;
      setBusy(false);
      // Store this URL's fresh server tree in the router cache, so Back/Forward to this chat
      // shows the new turn (and, after replaceState from /chat, the /chat/[id] page, not /chat).
      router.refresh();
    }
  }

  // Blocked while busy: deleting mid-stream would make the turn's log insert fail.
  async function remove(id: string) {
    if (inFlight.current || !confirm(L.confirmDelete)) return;
    try {
      await deleteChat(id);
    } catch {
      alert(L.error);
      return;
    }
    if (id === convId) openNewChat();
    else setConvs((cs) => cs.filter((c) => c.id !== id));
  }

  return (
    <div className="flex h-dvh">
      <aside className={`${showHistory ? 'fixed inset-0 z-10 flex' : 'hidden'} flex-col border-r bg-white md:static md:flex md:w-64`}>
        <div className="flex items-center gap-2 border-b p-3">
          <button onClick={openNewChat} className="flex-1 rounded border px-2 py-1 text-sm">+ {L.newChat}</button>
          <button onClick={() => setShowHistory(false)} aria-label="Close" className="px-2 md:hidden">✕</button>
        </div>
        <nav aria-label={L.history} className="flex-1 overflow-y-auto p-2">
          {convs.map((c) => (
            <div key={c.id} className={`flex items-center rounded ${c.id === convId ? 'bg-gray-100' : ''}`}>
              <Link
                href={`/chat/${c.id}`} prefetch={false} onClick={() => setShowHistory(false)}
                className="min-w-0 flex-1 p-2 text-sm"
              >
                <span className="flex items-center gap-1">
                  <span className="truncate">{c.title}</span>
                  {c.hasNewReply && c.id !== convId && (
                    <span role="img" aria-label={L.teacherReply} className="h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                  )}
                </span>
                <span className="text-xs text-gray-500">{colomboDate(c.updatedAt)}</span>
              </Link>
              <button
                onClick={() => remove(c.id)} disabled={busy} aria-label={`${L.delete}: ${c.title}`}
                className="px-2 text-gray-400 hover:text-red-600 disabled:opacity-30"
              >✕</button>
            </div>
          ))}
        </nav>
      </aside>

      <div className="mx-auto flex h-dvh min-w-0 max-w-3xl flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b p-3">
          <button onClick={() => setShowHistory(true)} className="rounded border px-2 py-1 text-sm md:hidden">{L.history}</button>
          <h1 className="mr-auto font-semibold">{L.title}</h1>
          <Link href="/classes" className="text-sm text-blue-600">{L.classes}</Link>
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
                        if (!n) return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
                        const s = m.sources[Number(n) - 1];
                        return s ? <a href={pdfUrl(s)} target="_blank" rel="noreferrer">{children}</a> : <span>{children}</span>;
                      },
                    }}
                  >{linkCitations(m.text, m.sources.length)}</ReactMarkdown>
                </div>
              ) : <p className="text-gray-500">{L.thinking}</p>}
              {m.sources.length > 0 && (
                <div className="mt-3 border-t pt-2">
                  <p className="mb-1 text-xs font-semibold text-gray-600">{L.sources}</p>
                  <ol className="space-y-1 text-xs">
                    {m.sources.map((s, j) => (
                      <li key={j}>
                        {s ? (
                          <a href={pdfUrl(s)} target="_blank" rel="noreferrer" className="text-blue-600">
                            [{s.n}] {subjectName(m.subjectId)}
                            {' → '}{(lang === 'si' ? s.unitSi : s.unitEn) ?? s.unitSi ?? s.unitEn ?? '—'}
                            {' → '}{s.title}, {L.page} {s.page}
                          </a>
                        ) : <span className="text-gray-500">[{j + 1}] ({L.removed})</span>}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <FlagBox m={m} L={L} onSent={() => setMsgs((ms) => ms.map((x, j) => (j === i ? { ...x, flagStatus: 'open' } : x)))} />
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
    </div>
  );
}

/** Under each saved answer: "Ask a teacher", then waiting / the teacher's reply / reviewed. */
function FlagBox({ m, L, onSent }: { m: Msg; L: (typeof t)[Lang]; onSent: () => void }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'already' | 'error'>('idle');
  const view = flagView(m);

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const note = String(new FormData(e.currentTarget).get('note') ?? '');
    setState('sending');
    try {
      if (await flagChat(m.logId!, note)) onSent();
      else setState('already');
    } catch {
      setState('error');
    }
  }

  if (view === 'none') return null;
  if (view === 'waiting') return <p className="mt-2 text-xs text-gray-500">{L.flagWaiting}</p>;
  if (view === 'reviewed') return <p className="mt-2 text-xs text-gray-500">{L.flagReviewed}</p>;
  if (view === 'reply') return (
    <div className="mt-3 rounded border-l-4 border-amber-500 bg-amber-50 p-2 text-sm">
      <p className="mb-1 text-xs font-semibold text-amber-800">
        {L.teacherReply}{m.repliedAt && ` · ${colomboDate(m.repliedAt)}`}
      </p>
      {/* Plain text on purpose: admin replies are never rendered as markdown/HTML. */}
      <p className="whitespace-pre-wrap">{m.reply}</p>
    </div>
  );
  if (state === 'already') return <p className="mt-2 text-xs text-gray-500">{L.flagSent}</p>;
  if (!open) return (
    <button onClick={() => setOpen(true)} className="mt-2 text-xs text-gray-500 hover:text-blue-600">{L.flag}</button>
  );
  return (
    <form onSubmit={send} className="mt-2 space-y-1">
      <textarea name="note" maxLength={500} rows={2} placeholder={L.flagNote} className="w-full resize-none rounded border p-2 text-sm" />
      <div className="flex items-center gap-2 text-sm">
        <button disabled={state === 'sending'} className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50">{L.flagSend}</button>
        <button type="button" onClick={() => setOpen(false)} className="px-2 text-gray-600">{L.flagCancel}</button>
        {state === 'error' && <span className="text-red-600">{L.error}</span>}
      </div>
    </form>
  );
}
