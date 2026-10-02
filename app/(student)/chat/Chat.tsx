'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Markdown from '@/app/Markdown';
import { linkCitations, titleFrom, colomboDate, flagView, type FlagStatus } from '@/lib/text';
import type { T } from '@/lib/i18n';
import type { Source, StoredTurn, ConversationItem } from '@/lib/conversations';
import { useT } from '@/app/ui/prefs';
import { Button, Icon, Label, Select, btn } from '@/app/ui/ui';
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

// Remembered subject: localStorage when available, in-memory otherwise (private mode).
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
  const { lang, t } = useT();
  const L = t.chat;
  const [storedSubject, setSubjectId] = useStored('subject');
  const subjectId = subjects.some((s) => s.id === storedSubject) ? storedSubject : subjects[0]?.id ?? '';
  const [convId, setConvId] = useState(conversationId);
  const [convs, setConvs] = useState(conversations);
  const [msgs, setMsgs] = useState(() => toMsgs(initialTurns));
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
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
        updateBot((m) => ({ ...m, text: res.status === 429 ? L.limit : t.common.error }));
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
          else if (ev.type === 'error') updateBot((m) => ({ ...m, text: (m.text ? m.text + '\n\n' : '') + t.common.error }));
        }
      }
    } catch {
      updateBot((m) => ({ ...m, text: t.common.error }));
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
      alert(t.common.error);
      return;
    }
    if (id === convId) openNewChat();
    else setConvs((cs) => cs.filter((c) => c.id !== id));
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl">
      <aside className={`${showHistory ? 'fixed inset-0 z-30 flex' : 'hidden'} w-full flex-col bg-bg md:static md:flex md:w-72 md:border-r md:border-border`}>
        <div className="flex items-center gap-2 p-3">
          <Button variant="secondary" size="sm" onClick={openNewChat} className="flex-1">
            <Icon name="plus" /> {L.newChat}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)} aria-label={t.common.close} className="md:hidden">
            <Icon name="x" />
          </Button>
        </div>
        <Label className="px-4 pb-1">{L.history}</Label>
        <nav aria-label={L.history} className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {!convs.length && <p className="px-2 py-3 text-sm text-subtle">{L.noChats}</p>}
          {convs.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center rounded-2xl ${c.id === convId ? 'bg-surface shadow-card' : 'hover:bg-surface-2'}`}
            >
              <Link
                href={`/chat/${c.id}`} prefetch={false} onClick={() => setShowHistory(false)}
                aria-current={c.id === convId ? 'page' : undefined} className="min-w-0 flex-1 px-3 py-2"
              >
                <span className="flex items-center gap-2">
                  <span className={`truncate text-sm ${c.id === convId ? 'text-fg' : 'text-muted'}`}>{c.title}</span>
                  {c.hasNewReply && c.id !== convId && (
                    <span role="img" aria-label={L.newReply} className="size-2.5 shrink-0 rounded-full bg-grad" />
                  )}
                </span>
                <span className="font-mono text-[11px] text-subtle">{colomboDate(c.updatedAt)}</span>
              </Link>
              <button
                onClick={() => remove(c.id)} disabled={busy} aria-label={`${t.common.delete}: ${c.title}`}
                className="mr-1 rounded-md p-2 text-subtle opacity-60 hover:text-danger group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-20 cursor-pointer"
              >
                <Icon name="trash" className="size-3.5" />
              </button>
            </div>
          ))}
        </nav>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <Button variant="ghost" size="sm" onClick={() => setShowHistory(true)} className="md:hidden" aria-label={L.history}>
            <Icon name="list" /> <span>{L.history}</span>
          </Button>
          <label className="ml-auto flex items-center gap-2 text-sm">
            <span className="caps text-subtle">{L.subject}</span>
            <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="min-h-9 py-1">
              {subjects.map((s) => <option key={s.id} value={s.id}>{lang === 'si' ? s.name_si : s.name_en}</option>)}
            </Select>
          </label>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
            {!subjects.length && <p className="text-muted">{L.noSubjects}</p>}
            {!msgs.length && subjects.length > 0 && (
              <div className="py-16 text-center">
                <span aria-hidden className="mx-auto mb-5 block size-14 rounded-full bg-grad p-1 shadow-[0_0_40px_-6px_var(--accent)]"><span className="block size-full rounded-full bg-bg" /></span>
                <h1 className="text-xl font-semibold tracking-tight">{L.emptyTitle}</h1>
                <p className="mt-2 text-sm text-muted">{L.empty}</p>
              </div>
            )}
            {msgs.map((m, i) => m.role === 'user' ? (
              <div key={i} className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-[22px] rounded-br-md bg-fg px-4 py-2.5 text-bg">{m.text}</div>
            ) : (
              <article key={i} className="grad-border max-w-full rounded-[22px] rounded-bl-md px-4 py-3 shadow-card">
                {m.text ? (
                  <Markdown
                    components={{
                      a: ({ href, children }) => {
                        const n = href?.match(/^#src-(\d+)$/)?.[1];
                        if (!n) return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
                        const s = m.sources[Number(n) - 1];
                        const cls = 'mx-0.5 inline-flex items-center rounded-full bg-accent-soft px-1.5 text-[11px] font-bold text-accent no-underline';
                        return s ? <a href={pdfUrl(s)} target="_blank" rel="noreferrer" className={cls}>{children}</a> : <span className={cls}>{children}</span>;
                      },
                    }}
                  >{linkCitations(m.text, m.sources.length)}</Markdown>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-subtle">
                    <span aria-hidden className="size-2 animate-pulse rounded-full bg-grad" /> {L.thinking}
                  </p>
                )}
                {m.sources.length > 0 && (
                  <div className="mt-3 border-t border-dashed border-border-strong pt-2">
                    <Label className="mb-1">{L.sources}</Label>
                    <ol className="space-y-0.5 font-mono text-[11px]">
                      {m.sources.map((s, j) => (
                        <li key={j}>
                          {s ? (
                            <a href={pdfUrl(s)} target="_blank" rel="noreferrer" className="text-muted hover:text-accent">
                              [{s.n}] {subjectName(m.subjectId)} › {(lang === 'si' ? s.unitSi : s.unitEn) ?? s.unitSi ?? s.unitEn ?? '—'} › {s.title} · {t.common.page} {s.page}
                            </a>
                          ) : <span className="text-subtle">[{j + 1}] ({L.removed})</span>}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                <FlagBox m={m} t={t} onSent={() => setMsgs((ms) => ms.map((x, j) => (j === i ? { ...x, flagStatus: 'open' } : x)))} />
              </article>
            ))}
            <div ref={endRef} />
          </div>
        </div>

        <form onSubmit={ask} className="border-t border-border bg-bg px-4 py-3">
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-[28px] border border-border bg-surface p-1.5 pl-4 shadow-card transition focus-within:border-accent-line focus-within:shadow-[0_4px_24px_-4px_var(--accent-line)]">
            <textarea
              name="q" required maxLength={1000} rows={2} placeholder={L.placeholder} aria-label={L.placeholder}
              className="max-h-40 min-h-11 flex-1 resize-none bg-transparent py-2 text-sm text-fg placeholder:text-subtle focus:outline-none"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
            />
            <button disabled={busy || !subjectId} className={btn('primary', 'md', 'shrink-0')}>
              <Icon name="send" /> <span className="hidden sm:inline">{L.send}</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

/** Under each saved answer: "Ask a teacher", then waiting / the teacher's reply / reviewed. */
function FlagBox({ m, t, onSent }: { m: Msg; t: T; onSent: () => void }) {
  const L = t.chat;
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

  const status = (text: string) => <p className="mt-3 flex items-center gap-1.5 text-xs text-subtle"><Icon name="flag" className="size-3.5" /> {text}</p>;
  if (view === 'none') return null;
  if (view === 'waiting') return status(L.flagWaiting);
  if (view === 'reviewed') return status(L.flagReviewed);
  if (view === 'reply') return (
    <div className="mt-3 rounded-2xl border border-accent-line bg-accent-soft p-3 text-sm">
      <p className="mb-1 caps text-accent">
        {L.teacherReply}{m.repliedAt && ` · ${colomboDate(m.repliedAt)}`}
      </p>
      {/* Plain text on purpose: admin replies are never rendered as markdown/HTML. */}
      <p className="whitespace-pre-wrap text-fg">{m.reply}</p>
    </div>
  );
  if (state === 'already') return status(L.flagSent);
  if (!open) return (
    <button onClick={() => setOpen(true)} className="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-xs text-subtle hover:text-fg">
      <Icon name="flag" className="size-3.5" /> {L.flag}
    </button>
  );
  return (
    <form onSubmit={send} className="mt-3 space-y-2">
      <textarea
        name="note" maxLength={500} rows={2} placeholder={L.flagNote} aria-label={L.flagNote}
        className="w-full resize-none rounded-xl border border-border-strong bg-bg px-3 py-2 text-sm placeholder:text-subtle focus:border-accent focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={state === 'sending'}>{L.flagSend}</Button>
        <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>{t.common.cancel}</Button>
        {state === 'error' && <span role="alert" className="text-sm text-danger">{t.common.error}</span>}
      </div>
    </form>
  );
}
