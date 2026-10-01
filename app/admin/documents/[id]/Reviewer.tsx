'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  savePage, retryOcr, setUnitRange, setDocumentStatus, deleteDocument,
} from '@/app/admin/actions';

type Doc = { id: string; title: string; status: string; error: string | null; subject: string; page_count: number; pages_done: number };
type Page = { page_no: number; text: string; unit_id: string | null; ocr_failed: boolean; reviewed: boolean };
type Unit = { id: string; name_en: string; name_si: string };

const btn = 'rounded border px-2 py-1 text-sm disabled:opacity-50';

export default function Reviewer({ doc, pages, units }: { doc: Doc; pages: Page[]; units: Unit[] }) {
  const router = useRouter();
  const [n, setN] = useState(pages.find((p) => p.ocr_failed)?.page_no ?? pages[0]?.page_no ?? 1);
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const page = pages.find((p) => p.page_no === n);
  const unitName = (id: string | null) => units.find((u) => u.id === id)?.name_en ?? '—';

  // Progress text is set outside the transition so it shows immediately; the server actions
  // call revalidatePath, which already refreshes this page's data.
  const run = (label: string, fn: () => Promise<unknown>, after?: () => void) => {
    setMsg(`${label}…`);
    start(async () => {
      try {
        await fn();
        setMsg(`${label}: done`);
        after?.();
      } catch (e) {
        setMsg(`${label} failed: ${(e as Error).message}`);
      }
    });
  };

  function unitRange(fd: FormData) {
    const unit = String(fd.get('unit'));
    run('Set unit', () => setUnitRange(doc.id, Number(fd.get('from')), Number(fd.get('to')), unit || null));
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold">{doc.title} <span className="text-sm text-gray-500">({doc.subject})</span></h1>
        <span className="rounded bg-gray-100 px-2 py-1 text-sm">{doc.status}</span>
        {(doc.status === 'review' || doc.status === 'archived') && (
          <button className={btn} disabled={pending} onClick={() => run('Publish', () => setDocumentStatus(doc.id, 'live'))}>Publish</button>
        )}
        {(doc.status === 'live' || doc.status === 'review') && (
          <button className={btn} disabled={pending} onClick={() => run('Archive', () => setDocumentStatus(doc.id, 'archived'))}>Archive</button>
        )}
        {doc.status === 'failed' && (
          <button className={btn} disabled={pending} onClick={() => run('Retry processing', () => setDocumentStatus(doc.id, 'queued'))}>Retry processing</button>
        )}
        <button
          className={`${btn} text-red-600`} disabled={pending}
          onClick={() => confirm('Delete this document, its pages and chunks?') &&
            run('Delete', () => deleteDocument(doc.id), () => router.push('/admin/documents'))}
        >Delete</button>
      </header>
      {doc.error && <p className="text-sm text-red-600">{doc.error}</p>}
      {(doc.status === 'queued' || doc.status === 'processing') && (
        <p className="text-sm">Processing: {doc.pages_done}/{doc.page_count || '?'} pages OCR&apos;d…</p>
      )}
      {msg && <p className="text-sm text-gray-700">{msg}</p>}

      {pages.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button className={btn} disabled={n <= 1} onClick={() => setN(n - 1)}>← Prev</button>
            <select value={n} onChange={(e) => setN(Number(e.target.value))} className="rounded border p-1">
              {pages.map((p) => (
                <option key={p.page_no} value={p.page_no}>
                  Page {p.page_no}{p.ocr_failed ? ' ⚠ OCR failed' : p.reviewed ? ' ✓' : ''}
                </option>
              ))}
            </select>
            <button className={btn} disabled={n >= pages.length} onClick={() => setN(n + 1)}>Next →</button>
            <span className="text-gray-600">Unit: {unitName(page?.unit_id ?? null)}</span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <iframe key={n} src={`/api/pdf/${doc.id}?page=${n}`} className="h-[70vh] w-full rounded border" />
              <a href={`/api/pdf/${doc.id}?page=${n}`} target="_blank" rel="noreferrer" className="text-sm text-blue-600">Open page in new tab</a>
            </div>
            <div className="flex flex-col gap-2">
              {page?.ocr_failed && <p className="text-sm text-red-600">OCR failed for this page.</p>}
              <textarea
                key={`${n}:${page?.text}`} ref={textRef} defaultValue={page?.text ?? ''}
                className="h-[65vh] w-full rounded border p-2 font-mono text-sm"
              />
              <div className="flex gap-2">
                <button className={btn} disabled={pending} onClick={() => run('Save page', () => savePage(doc.id, n, textRef.current?.value ?? ''))}>Save page</button>
                <button className={btn} disabled={pending} onClick={() => run('Retry OCR', () => retryOcr(doc.id, n))}>Retry OCR</button>
              </div>
            </div>
          </div>

          <form action={unitRange} className="flex flex-wrap items-center gap-2 rounded border p-3 text-sm">
            <span>Assign pages</span>
            <input name="from" type="number" min={1} max={pages.length} required defaultValue={n} className="w-20 rounded border p-1" />
            <span>to</span>
            <input name="to" type="number" min={1} max={pages.length} required defaultValue={n} className="w-20 rounded border p-1" />
            <span>→</span>
            <select name="unit" className="rounded border p-1">
              <option value="">(no unit)</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name_en} / {u.name_si}</option>)}
            </select>
            <button className={btn} disabled={pending}>Apply</button>
          </form>
        </>
      )}
    </div>
  );
}
